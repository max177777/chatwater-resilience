#!/usr/bin/env node
/*
 * Builds the ChatWater document library from the supplied archives.
 *
 *   node scripts/library/build.js [--input-dir ~/Downloads] [--no-ocr]
 *
 * Reads (never modifies) the originals named in scripts/library/sources.json, extracts copies to
 * .cache/ingest (git-ignored) and writes:
 *   knowledge/library/manifest.json        one entry per source: identity, role, scope, extraction quality
 *   knowledge/library/passages/<id>.json   passages with page / slide / section locators
 *   frameworks/stage-guidance.json         the revised framework as structured Stage 2–4 guidance
 *
 * Scanned PDFs are OCRed locally (macOS PDFKit renderer + tesseract) when both are available;
 * otherwise the source is marked unavailable for retrieval instead of being indexed empty.
 * Output contains no timestamps, so rebuilding unchanged inputs gives identical files.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const JSZip = require('jszip');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const ROOT = path.join(__dirname, '..', '..');
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf8'));
const CACHE = path.join(ROOT, '.cache', 'ingest');
const OUT = path.join(ROOT, 'knowledge', 'library');
const PASSAGE_CHARS = 1000;

const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const INPUT_DIR = path.resolve(arg('--input-dir', path.join(os.homedir(), 'Downloads')).replace(/^~/, os.homedir()));
const OCR = !argv.includes('--no-ocr');

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- text helpers
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };
const decode = s => s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => ENT[e] ?? (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : m));
const stripTags = s => decode(s.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
const clean = s => s.replace(/\u00ad/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').trim();

const REDACT = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email removed]'],
  [/\b(?:tel(?:ephone|p)?|phone|fax|hp|whatsapp|wa)\.?\s*:?\s*\+?\d[\d\s().-]{6,}\d/gi, '[phone removed]'],
  [/(?:\+62|\(0\d{2,3}\))[\d\s-]{6,14}\d/g, '[phone removed]'],
];
function redact(text, stats) {
  let out = text;
  for (const [re, rep] of REDACT) out = out.replace(re, () => { stats.redactions++; return rep; });
  return out;
}

const INSTRUCTION_LIKE = /\b(ignore|disregard|forget|override)\b[^.]{0,60}\b(previous|prior|above|earlier|all|application|system)\b[^.]{0,40}\b(instructions?|rules?|prompts?)\b|\bsystem prompt\b|\byou are now\b|\bas an ai (model|assistant)\b/i;
const isToc = t => (t.match(/(\.\s?){5,}\s*\d/g) || []).length >= 3;

/** Split text into passages of at most PASSAGE_CHARS on sentence boundaries. */
function chunk(text) {
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?;])\s+(?=[A-Z0-9("“•\-])/);
  const out = [];
  let buf = '';
  for (const s of sentences) {
    if (buf && (buf + ' ' + s).length > PASSAGE_CHARS) { out.push(buf); buf = ''; }
    if (s.length > PASSAGE_CHARS * 1.5) { for (let i = 0; i < s.length; i += PASSAGE_CHARS) out.push(s.slice(i, i + PASSAGE_CHARS)); continue; }
    buf += (buf ? ' ' : '') + s;
  }
  if (buf) out.push(buf);
  // fold very short tails into the previous passage
  return out.reduce((acc, p) => { if (acc.length && p.length < 120 && acc[acc.length - 1].length + p.length < PASSAGE_CHARS * 1.3) acc[acc.length - 1] += ' ' + p; else acc.push(p); return acc; }, []);
}

// ---------------------------------------------------------------- inputs
function resolveInputs() {
  const inputs = {};
  for (const [kind, name] of Object.entries(CFG.inputs)) {
    const file = path.join(INPUT_DIR, name);
    if (!fs.existsSync(file)) throw new Error(`Missing input ${name} in ${INPUT_DIR}`);
    const buf = fs.readFileSync(file);
    inputs[kind] = { kind, file, name, bytes: buf.length, sha256: sha256(buf), buf };
  }
  return inputs;
}

/** Duplicate frameworks ("… (1).docx") are compared by content; the suffix says nothing about which is newer. */
async function checkFrameworkDuplicates(primary) {
  const base = primary.name.replace(/\.docx$/i, '');
  const candidates = fs.readdirSync(INPUT_DIR).filter(f => f !== primary.name && f.startsWith(base) && /\.docx$/i.test(f));
  const text = async file => (await mammoth.extractRawText({ path: file })).value.replace(/\s+/g, ' ').trim();
  const mine = await text(primary.file);
  const found = [];
  for (const f of candidates) {
    const other = await text(path.join(INPUT_DIR, f));
    found.push({ file: f, identical_text: other === mine, sha256: sha256(fs.readFileSync(path.join(INPUT_DIR, f))) });
  }
  const differing = found.filter(f => !f.identical_text);
  if (differing.length) throw new Error(`Framework duplicates differ in content (${differing.map(f => f.file).join(', ')}). Compare them and set inputs.framework in sources.json to the version to use.`);
  return { pattern: `${base}*.docx`, found, note: found.length ? 'Duplicates have identical text.' : 'No duplicate framework file was present.' };
}

async function extractArchive(input) {
  const dir = path.join(CACHE, 'raw', input.kind);
  const zip = await JSZip.loadAsync(input.buf);
  const files = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const dest = path.join(dir, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const buf = await entry.async('nodebuffer');
    fs.writeFileSync(dest, buf);
    files[name] = dest;
  }
  return files;
}

// ---------------------------------------------------------------- PDF
async function pdfPages(buf) {
  const pages = [];
  await pdfParse(buf, {
    pagerender: pd => pd.getTextContent({ normalizeWhitespace: true }).then(tc => {
      let last = null, s = '';
      for (const it of tc.items) {
        const y = it.transform[5];
        if (last !== null && Math.abs(y - last) > 2) s += '\n';
        s += it.str; last = y;
      }
      pages.push(s); return s;
    }),
  });
  return pages;
}

/** Lines repeated on many pages (running headers, footers, disclosure stamps) are removed. */
function stripRepeated(pages) {
  if (pages.length < 8) return { pages, removed: [] };
  const norm = l => l.trim().replace(/\d+/g, '#');
  const count = new Map();
  for (const p of pages) for (const l of new Set(p.split('\n').map(norm))) if (l.length >= 3 && l.length <= 140) count.set(l, (count.get(l) || 0) + 1);
  const rep = new Set([...count].filter(([, n]) => n >= Math.max(4, pages.length * 0.3)).map(([l]) => l));
  return { pages: pages.map(p => p.split('\n').filter(l => !rep.has(norm(l))).join('\n')), removed: [...rep].slice(0, 12) };
}

/*
 * Headings come from the text layer only (no font information), so candidates are filtered:
 *   section   "2.3 Exposure", "VI. Proposed …", "BAB II", "Pasal 5". Section numbers never start with 0
 *             (rules out table values such as "0.14 Second constant …").
 *   caption   "Table 5.1: …", "Box 4.1 …". A table or box caption labels the text for at most CAPTION_PAGES
 *             further pages, a figure caption only its own page; then the enclosing section heading applies.
 * Not headings: numbered list items (a run "1. … 2. …", a "Label: description" item, or a line that
 * wraps into a lower-case continuation), contents-page entries (a contents title on the page, or a
 * trailing page number such as "Assessment46" / "… Sektor 71"), and fragments with unbalanced brackets.
 */
const SECTION = /^(?:[1-9]\d?(?:\.\d{1,2}){0,3}\.?\s+[A-Z][^\n]{2,90}|[IVX]{1,5}\.\s+[A-Z][^\n]{2,90}|(?:BAB|Bab) [IVXLC]+\b[^\n]{0,80}|Pasal \d+[A-Z]?)$/;
// a separator or a capitalised title after the number: "Table 4.2 summarises …" is a sentence, not a caption
const CAPTION_SEP = /^(?:Box|Table|Tabel|Figure|Gambar) \d+(?:[.-]\d+)*(?::|\.(?=\s)|\s+[–—-])\s*\S/;
const CAPTION = /^(?:Box|Table|Tabel|Figure|Gambar) \d+(?:[.-]\d+)*(?::|\.(?=\s)|\s+[–—-]|(?=\s+[A-Z]))\s*\S[^\n]{0,100}$/;
const CONTENTS = /^(?:table of contents|contents|daftar isi|list of (?:tables|figures|boxes)|daftar (?:tabel|gambar))$/i;
const CAPTION_PAGES = 2;
const listNo = line => { const m = line.match(/^([1-9]\d?)\.\s+\S/); return m ? +m[1] : null; };
const DANGLING = /\s(?:for|and|of|the|in|to|on|with|from|dan|untuk|di|dalam|terhadap|serta)$/i;

function pageSegments(text, state, page) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const contents = lines.some(l => CONTENTS.test(l));
  const segs = [];
  const current = () => (state.caption && page - state.captionPage <= state.captionSpan ? state.caption : state.section);
  let cur = { heading: current(), lines: [] };
  const open = heading => { if (cur.lines.length) segs.push(cur); cur = { heading, lines: [] }; };
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const next = lines[i + 1] || '';
    const tocRef = /[a-z]\d{1,3}$|\s\d{1,3}$/.test(line) || /\.{4,}/.test(line);
    const separated = CAPTION_SEP.test(line);
    if (!contents && !tocRef && line.length <= 110 && CAPTION.test(line) && !/[,;]$/.test(line) && (separated || !/^[a-z(]/.test(next))) {
      if (separated && /^[a-z]/.test(next) && next.length <= 60) { line = `${line} ${next}`; i++; }
      state.caption = line.replace(/\.$/, ''); state.captionPage = page;
      state.captionSpan = /^(?:Figure|Gambar)/.test(line) ? 0 : CAPTION_PAGES;
      open(state.caption);
      continue;
    }
    const balanced = (line.match(/\(/g) || []).length === (line.match(/\)/g) || []).length;
    let isSection = !contents && !tocRef && balanced && line.length <= 100 && !/[.,;:]$/.test(line) && SECTION.test(line);
    if (isSection) {
      const n = listNo(line);
      if (/^[a-z(]/.test(next)) isSection = false;
      else if (n != null && /:\s/.test(line)) isSection = false;
      else if (n != null && (listNo(lines[i - 1] || '') === n - 1 || listNo(next) === n + 1)) isSection = false;
    }
    if (isSection) {
      if (DANGLING.test(line) && next.length <= 60 && /^[A-Z]/.test(next) && !/[.,;:]$/.test(next) && !SECTION.test(next)) { line = `${line} ${next}`; i++; }
      state.section = line; state.caption = null;
      open(line);
      continue;
    }
    cur.lines.push(line);
  }
  if (cur.lines.length) segs.push(cur);
  return segs.map(s => ({ heading: s.heading, text: s.lines.join('\n').replace(/(\w)-\n(?=[a-z])/g, '$1').replace(/\n/g, ' ') }));
}

function fixLigatures(text, stats) {
  // the GCF PDFs encode "ti" and "ft" with glyphs that extract as ":" and "C" (e.g. "consulta:on", "draC")
  return text
    .replace(/(?<=[a-z]):(?=[a-z])/g, () => { stats.ligatures++; return 'ti'; })
    .replace(/(?<=[a-z])C(?=[a-z]|[\s,.;)]|$)/g, () => { stats.ligatures++; return 'ft'; });
}

async function ocrPages(file, id) {
  const dir = path.join(CACHE, 'ocr', id);
  const have = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^page-\d+\.txt$/.test(f)).sort() : [];
  if (!have.length) {
    if (!OCR) return null;
    try { execFileSync('tesseract', ['--version'], { stdio: 'ignore' }); execFileSync('swift', ['--version'], { stdio: 'ignore' }); } catch { return null; }
    log(`  OCR ${id} (local tesseract)…`);
    execFileSync('swift', [path.join(__dirname, 'render-pdf.swift'), file, dir, '300'], { stdio: 'ignore' });
    for (const png of fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort()) {
      execFileSync('tesseract', [path.join(dir, png), path.join(dir, png.replace(/\.png$/, '')), '-l', 'ind+eng', '--psm', '3', 'quiet'], { stdio: 'ignore' });
    }
  }
  return fs.readdirSync(dir).filter(f => /^page-\d+\.txt$/.test(f)).sort().map(f => fs.readFileSync(path.join(dir, f), 'utf8'));
}

async function extractPdf(file, meta, stats) {
  let pages = await pdfPages(fs.readFileSync(file));
  stats.units = pages.length; stats.unit_type = 'page';
  stats.empty_units = pages.filter(p => p.replace(/\s/g, '').length < 40).length;
  stats.method = 'pdf text layer (pdf-parse)';
  let ocr = false;
  if (stats.empty_units / pages.length > 0.8) {
    const o = await ocrPages(file, meta.id);
    if (!o) { stats.method = 'none: scanned PDF and local OCR unavailable'; return null; }
    pages = o; ocr = true;
    stats.method = 'local OCR (macOS PDFKit render at 300 dpi + tesseract ind+eng)';
    stats.empty_units = pages.filter(p => p.replace(/\s/g, '').length < 40).length;
  }
  // printed page numbers ("- 694 -") are read before running headers are removed; OCR misreads some,
  // so the most common offset from the PDF page index is used for every page
  let offset = null;
  if (ocr) {
    const counts = new Map();
    pages.forEach((p, i) => { const n = (p.match(/^[^\n]{0,40}?-\s?(\d{3})\s?-/m) || [])[1]; if (n) counts.set(+n - i, (counts.get(+n - i) || 0) + 1); });
    const best = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 3) { offset = best[0]; stats.printed_pages = `printed pages ${offset}–${offset + pages.length - 1}, inferred from the page sequence (${best[1]} of ${pages.length} page numbers read by OCR agree)`; }
  }
  const rep = stripRepeated(pages);
  pages = rep.pages; stats.removed_repeated_lines = rep.removed;
  const units = [];
  const state = { section: '', caption: null, captionPage: 0, captionSpan: 0 };
  pages.forEach((text, i) => {
    let t = clean(text);
    if (meta.id.startsWith('gcf-')) t = fixLigatures(t, stats);
    for (const seg of pageSegments(t, state, i + 1)) units.push({ locator: { page: i + 1, ...(offset != null ? { printed_page: offset + i } : {}) }, heading: seg.heading, text: seg.text });
  });
  stats.ocr = ocr;
  return units;
}

// ---------------------------------------------------------------- DOCX
function htmlBlocks(html) {
  const blocks = [];
  const re = /<(h[1-6]|p|table|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, tag, body] = m;
    if (tag === 'table') {
      const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => stripTags(c[1].replace(/<\/p>/g, '\n'))));
      blocks.push({ type: 'table', rows });
    } else if (tag === 'ul' || tag === 'ol') {
      for (const li of body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)) blocks.push({ type: 'p', text: '• ' + stripTags(li[1]) });
    } else {
      const text = stripTags(body);
      if (text) blocks.push({ type: tag[0] === 'h' ? 'h' : 'p', level: tag[0] === 'h' ? +tag[1] : 0, text });
    }
  }
  return blocks;
}
const links = html => [...new Set([...html.matchAll(/href="(https?:[^"]+)"/g)].map(m => decode(m[1])))];

const SYN_HEADING = /^(?:\d{1,2}(?: \d{1,2})? [A-Z][^.]{2,90}|Appendix [A-C] [^.]{2,90}|[A-C]\d{1,2} [A-Z][^.]{2,90})$/;
const sectionLabel = h => h.replace(/^(\d{1,2}) (\d{1,2}) /, '$1.$2 ');

async function extractDocx(file, meta, stats) {
  const { value: html } = await mammoth.convertToHtml({ path: file });
  stats.method = 'docx (mammoth)'; stats.unit_type = 'section';
  stats.links = links(html);
  const units = [];
  let heading = '', buf = [];
  const flush = () => { const text = buf.join('\n').trim(); if (text) units.push({ locator: { section: sectionLabel(heading) || '(start)' }, heading: sectionLabel(heading), text }); buf = []; };
  for (const b of htmlBlocks(html)) {
    if (b.type === 'h' || (b.type === 'p' && b.text.length <= 100 && SYN_HEADING.test(b.text))) { flush(); heading = b.text; continue; }
    if (b.type === 'table') buf.push(b.rows.map(r => r.filter(Boolean).join(' | ')).filter(Boolean).join('\n'));
    else buf.push(b.text);
  }
  flush();
  stats.units = units.length;
  return units;
}

// ---------------------------------------------------------------- PPTX
async function extractPptx(file, meta, stats) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const pres = await zip.file('ppt/presentation.xml').async('string');
  const rels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  const target = Object.fromEntries([...rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
  const order = [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map(m => 'ppt/' + target[m[1]].replace(/^\.?\//, ''));
  const paras = xml => [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
    .map(p => decode([...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join('')).replace(/\s+/g, ' ').trim())
    .filter(t => t && !/^https?:\/\/(\w+\.)?pinterest\.\w+/i.test(t) && !/^(HOME|START|MATERI)$/i.test(t)
      && !/^(the example text goes here|click to (add|edit)|lorem ipsum)\b/i.test(t));
  const units = [];
  let skipped = 0;
  for (const [i, slidePath] of order.entries()) {
    const xml = await zip.file(slidePath)?.async('string');
    if (!xml) continue;
    let lines = paras(xml);
    const relFile = slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels');
    const srel = await zip.file(relFile)?.async('string');
    const notesTarget = srel && (srel.match(/Target="\.\.\/notesSlides\/([^"]+)"/) || [])[1];
    if (notesTarget) {
      const notes = paras(await zip.file('ppt/notesSlides/' + notesTarget).async('string')).filter(t => !/^\d+$/.test(t));
      if (notes.join(' ').length > 20) lines = [...lines, 'Notes: ' + notes.join(' ')];
    }
    const text = lines.join('\n');
    if (text.replace(/\s/g, '').length < 40) { skipped++; continue; }
    units.push({ locator: { slide: i + 1 }, heading: lines[0].slice(0, 90), text });
  }
  stats.method = 'pptx slide text and speaker notes (slide positions from presentation order)';
  stats.unit_type = 'slide'; stats.units = order.length; stats.empty_units = skipped;
  return units;
}

// ---------------------------------------------------------------- framework → structured guidance
async function buildFramework(file, meta) {
  const blocks = htmlBlocks((await mammoth.convertToHtml({ path: file })).value);
  const stage2 = [], stage3 = [], stage4 = { cost_components: [], financing_resources: [], funding_gap: [], outputs: [] };
  let mode = null, group = null, area = null, s4 = null;
  const GROUPS = { A: 'emission_output', B: 'emission_output', C1: 'indicator', C2: 'indicator' };
  for (const b of blocks) {
    const t = b.text || '';
    if (/^STAGE 2\b/i.test(t)) { mode = 2; continue; }
    if (/^STAGE THREE\b/i.test(t)) { mode = 3; continue; }
    if (/^STAGE FOUR\b/i.test(t)) { mode = 4; continue; }
    if (mode === 2) {
      const g = t.match(/^(A|B|C1|C2)\.\s+(.+)/);
      if (g) { group = { id: g[1], title: g[2].trim() }; continue; }
      if (b.type === 'table' && group && GROUPS[group.id]) {
        for (const [output, questions, actions] of b.rows.slice(1)) {
          if (!output) continue;
          const name = output.replace(/\s+/g, ' ').trim();
          stage2.push({
            id: `s2-${group.id.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}`,
            group: group.id, group_title: group.title, kind: GROUPS[group.id], output: name,
            questions: (questions || '').replace(/\s+/g, ' ').split(/(?<=\?)\s+/).map(s => s.trim()).filter(Boolean),
            actions: (actions || '').replace(/\s+/g, ' ').replace(/\.$/, '').split(/;\s*/).map(s => s.trim()).filter(Boolean),
            links: CFG.framework_links[name] || null,
          });
        }
      }
    }
    if (mode === 3 && b.type !== 'table') {
      const a = t.match(/^(\d)\.\s+(.+)/);
      if (a) { area = { n: +a[1], id: `s3-area-${a[1]}`, title: a[2].trim(), description: '', questions: [] }; stage3.push(area); continue; }
      if (!area) continue;
      if (/\?$/.test(t)) area.questions.push(t.replace(/^•\s*/, ''));
      else if (!area.description) area.description = t;
      else area.description += ' ' + t;
    }
    if (mode === 4 && b.type !== 'table') {
      const item = t.replace(/^•\s*/, '').trim();
      if (/^cost components$/i.test(item)) { s4 = 'cost_components'; continue; }
      if (/^financing resources$/i.test(item)) { s4 = 'financing_resources'; continue; }
      if (/^final output$/i.test(item)) { s4 = 'outputs'; continue; }
      if (!s4 || !item) continue;
      if (s4 === 'financing_resources' && /^(funding gap|source of funding)$/i.test(item)) stage4.funding_gap.push(item);
      else if (s4 === 'outputs') {
        const parts = item.split(/,\s*(?:and\s+)?/).map(s => s.trim()).filter(Boolean);
        const last = parts.pop().split(/\s+and\s+/);
        stage4.outputs.push(...parts, ...last);
      } else stage4[s4].push(item.replace(/[.?]$/, ''));
    }
  }
  return {
    source: meta.id, title: meta.title, version: meta.date, review_status: meta.review_status,
    links_note: CFG.framework_links._note,
    stage2, stage3,
    stage4: { ...stage4, note: 'The framework lists "Funding gap" and "Source of funding" without further detail; ChatWater does not compute either.' },
  };
}

function frameworkUnits(fw) {
  const units = [];
  for (const r of fw.stage2) units.push({
    locator: { section: `Stage 2 › ${r.group}. ${r.group_title} › ${r.output}` }, heading: `Stage 2 · ${r.output}`,
    text: `${r.kind === 'indicator' ? 'Indicator group' : 'ECAM output'}: ${r.output}. Questions to investigate: ${r.questions.join(' ')} Potential actions to consider: ${r.actions.join('; ')}.`,
    framework_ref: r.id,
  });
  for (const a of fw.stage3) units.push({
    locator: { section: `Stage 3 › ${a.n}. ${a.title}` }, heading: `Stage 3 · ${a.n}. ${a.title}`,
    text: `Project-planning area ${a.n}: ${a.title}. ${a.description}${a.questions.length ? ' Questions: ' + a.questions.join(' ') : ''}`, framework_ref: a.id,
  });
  const s4 = fw.stage4;
  units.push({ locator: { section: 'Stage 4 › Cost components' }, heading: 'Stage 4 · Cost components', text: `Cost components: ${s4.cost_components.join('; ')}.`, framework_ref: 's4-costs' });
  units.push({ locator: { section: 'Stage 4 › Financing resources' }, heading: 'Stage 4 · Financing resources', text: `Financing resources: ${s4.financing_resources.join('; ')}. Also listed: ${s4.funding_gap.join('; ')}.`, framework_ref: 's4-financing' });
  units.push({ locator: { section: 'Stage 4 › Final output' }, heading: 'Stage 4 · Final output', text: `Final output: ${s4.outputs.join('; ')}.`, framework_ref: 's4-outputs' });
  return units;
}

// ---------------------------------------------------------------- synthesis ↔ slides and qualifications
/** Slide references such as "[S02, slides 5–10; S03, slide 7]"; loose also reads unbracketed "S04, slides 28 and 31". */
function parseSlideRefs(text, loose = false) {
  const refs = [];
  const groups = [...text.matchAll(/\[([^\]]*S0\d[^\]]*)\]/g)].map(m => m[1]);
  if (loose) groups.push(...[...text.replace(/\[[^\]]*\]/g, '').matchAll(/S0\d,\s*slides?\s+\d+(?:\s*(?:[–-]|,|and|,\s*and)\s*\d+)*/g)].map(m => m[0]));
  for (const g of groups) {
    for (const part of g.split(';')) {
      const lab = (part.match(/S0\d/) || [])[0];
      if (!lab) continue;
      const nums = new Set();
      const body = part.replace(/S0\d,?/, '');
      for (const r of body.matchAll(/(\d+)\s*[–-]\s*(\d+)/g)) for (let n = +r[1]; n <= +r[2]; n++) nums.add(n);
      for (const s of body.replace(/(\d+)\s*[–-]\s*(\d+)/g, '').matchAll(/\d+/g)) nums.add(+s[0]);
      refs.push({ label: lab, slides: [...nums].sort((a, b) => a - b) });
    }
  }
  return refs;
}

function linkSynthesis(manifest, passagesBySource) {
  const syn = manifest.find(s => s.role === 'derived_synthesis' && s.status === 'indexed');
  if (!syn) return;
  const labelToId = syn.synthesis_of || {};
  const ps = passagesBySource[syn.id];
  // Appendix A: one qualification per A-number, with the slides it concerns
  const quals = {};
  for (const p of ps) {
    const m = (p.heading || '').match(/^(A\d{1,2}) (.+)/);
    if (!m) continue;
    const q = quals[m[1]] || (quals[m[1]] = { id: m[1], title: m[2], text: '', refs: [], locator: `Appendix A, ${m[1]}` });
    q.text += (q.text ? ' ' : '') + p.text;
    q.refs.push(...parseSlideRefs(p.text, true));
    p.flags = [...new Set([...(p.flags || []), 'qualification'])];
  }
  syn.qualifications = Object.values(quals).map(q => ({ id: q.id, title: q.title, locator: q.locator, refs: q.refs, text: q.text.slice(0, 600) }));
  const covers = (refs, label, slide) => refs.some(r => r.label === label && r.slides.includes(slide));
  for (const p of ps) {
    const refs = parseSlideRefs(p.text);
    if (!refs.length) continue;
    p.derived_from = refs.map(r => ({ source: labelToId[r.label] || r.label, label: r.label, slides: r.slides }));
    if ((p.flags || []).includes('qualification')) continue;
    const q = Object.values(quals).filter(q => refs.some(r => r.slides.some(s => covers(q.refs, r.label, s)))).map(q => q.id);
    if (q.length) p.qualifications = q;
  }
  for (const [label, id] of Object.entries(labelToId)) {
    for (const p of passagesBySource[id] || []) {
      const q = Object.values(quals).filter(q => covers(q.refs, label, p.locator.slide)).map(q => q.id);
      if (q.length) p.qualifications = [...new Set([...(p.qualifications || []), ...q])];
      p.synthesised_in = syn.id;
    }
  }
}

// ---------------------------------------------------------------- near-duplicates
const shingles = text => {
  const w = text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const s = new Set();
  for (let i = 0; i + 5 <= w.length; i++) s.add(w.slice(i, i + 5).join(' '));
  return s;
};
function markDuplicates(copy, canonical) {
  const index = new Map();
  canonical.forEach((p, i) => { for (const s of shingles(p.text)) { if (!index.has(s)) index.set(s, []); index.get(s).push(i); } });
  let dup = 0;
  const pages = new Map();
  for (const p of copy) {
    const sh = shingles(p.text);
    const hits = new Map();
    for (const s of sh) for (const i of index.get(s) || []) hits.set(i, (hits.get(i) || 0) + 1);
    let best = -1, bestN = 0;
    for (const [i, n] of hits) if (n > bestN) { best = i; bestN = n; }
    const containment = sh.size ? bestN / sh.size : 0;
    const pg = pages.get(p.locator.page) || { n: 0, d: 0 };
    pg.n++;
    if (best >= 0 && containment >= 0.6) { p.duplicate_of = canonical[best].id; dup++; pg.d++; }
    pages.set(p.locator.page, pg);
  }
  const dupPages = [...pages.values()].filter(v => v.d === v.n).length;
  return { passages: copy.length, duplicate_passages: dup, pages_fully_duplicated: dupPages, pages_with_text: pages.size };
}

// ---------------------------------------------------------------- quality
function quality(stats, units) {
  const text = units.map(u => u.text).join(' ');
  const toks = text.split(/\s+/).filter(Boolean);
  const singles = toks.filter(t => /^[b-hj-zB-HJ-Z]$/.test(t)).length / Math.max(1, toks.length);
  const notes = [];
  let q = 'good';
  if (stats.ocr) { q = 'fair'; notes.push('Text from local OCR; not proofread. Tables and list numbering are partly lost.'); }
  if (stats.ligatures) { q = 'fair'; notes.push(`${stats.ligatures} ligature glyphs repaired ("ti", "ft").`); }
  if (singles > 0.02) { q = 'fair'; notes.push(`Word spacing is broken in places (${(singles * 100).toFixed(1)}% single-letter tokens); some words split.`); }
  if (stats.unit_type === 'page' && stats.empty_units / stats.units > 0.2) { q = 'partial'; notes.push(`${stats.empty_units} of ${stats.units} pages have no text layer.`); }
  if (stats.unit_type === 'slide') notes.push('Slide text only; charts, images and diagrams are not extracted.');
  return { q, notes };
}

// ---------------------------------------------------------------- main
module.exports = { INSTRUCTION_LIKE, redact, chunk };
if (require.main === module) (async () => {
  const inputs = resolveInputs();
  log('Inputs:'); for (const i of Object.values(inputs)) log(`  ${i.name}  ${i.bytes} bytes  sha256 ${i.sha256.slice(0, 16)}…`);
  const fwDup = await checkFrameworkDuplicates(inputs.framework);
  log(`Framework duplicates: ${fwDup.note}`);

  const files = { framework: { [inputs.framework.name]: inputs.framework.file } };
  for (const kind of ['sources', 'examples']) files[kind] = await extractArchive(inputs[kind]);

  const manifest = [], passagesBySource = {};
  let framework = null;
  const archived = new Set();
  for (const [key, meta] of Object.entries(CFG.sources)) {
    const [kind, inner] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const file = files[kind]?.[inner];
    archived.add(`${kind}:${inner}`);
    const base = {
      id: meta.id, title: meta.title || null, publisher: meta.publisher || null, date: meta.date || null,
      language: meta.language || null, scope: meta.scope || null, sector: meta.sector || 'water and sanitation', stages: meta.stages || [], topic: meta.topic || null,
      role: meta.role || null, review_status: meta.review_status || null,
      original_filename: path.basename(inner), archive: inputs[kind].name, archive_path: inner,
      sha256: file ? sha256(fs.readFileSync(file)) : null,
      urls: [], ...(meta.supplied_links ? { supplied_links: meta.supplied_links } : {}),
      relationships: [
        ...(meta.near_duplicate_of ? [{ type: 'near_duplicate_of', source: meta.near_duplicate_of }] : []),
        ...(meta.translation_of ? [{ type: 'translation_of', source: meta.translation_of }] : []),
        ...(meta.synthesis_of ? Object.entries(meta.synthesis_of).map(([label, id]) => ({ type: 'synthesis_of', source: id, label })) : []),
        ...(meta.synthesis_label ? [{ type: 'synthesised_in', source: 'ee-synthesis-en', label: meta.synthesis_label }] : []),
        ...(meta.parent ? [{ type: 'part_of', source: meta.parent }] : []),
      ],
      family: meta.translation_of ? [meta.id, meta.translation_of].sort()[0].replace(/-(en|id)$/, '') : meta.near_duplicate_of || meta.id,
      caveats: meta.caveats || [],
      ...(meta.synthesis_of ? { synthesis_of: meta.synthesis_of } : {}),
    };
    if (!file) { manifest.push({ ...base, status: 'missing', extraction: null }); log(`  MISSING ${inner}`); continue; }
    if (meta.exclude) { manifest.push({ ...base, status: 'excluded', exclusion_reason: meta.exclude, extraction: null }); log(`  excluded ${meta.id}`); continue; }
    const stats = { redactions: 0, ligatures: 0 };
    const ext = path.extname(file).toLowerCase();
    let units;
    if (meta.role === 'team_framework') {
      framework = await buildFramework(file, meta);
      units = frameworkUnits(framework);
      Object.assign(stats, { method: 'docx tables and headings parsed into structured guidance', unit_type: 'section', units: units.length });
    } else if (ext === '.pdf') units = await extractPdf(file, meta, stats);
    else if (ext === '.docx') units = await extractDocx(file, meta, stats);
    else if (ext === '.pptx') units = await extractPptx(file, meta, stats);
    if (!units) {
      manifest.push({ ...base, status: 'unavailable', extraction: { method: stats.method, quality: 'unavailable', units: stats.units, unit_type: stats.unit_type, passages: 0, notes: ['Not indexed: no text could be extracted locally.'] } });
      log(`  UNAVAILABLE ${meta.id}`); continue;
    }
    const passages = [];
    let toc = 0;
    for (const u of units) {
      if (isToc(u.text)) { toc++; continue; }
      const pieces = u.framework_ref ? [u.text] : chunk(u.text);
      pieces.forEach((piece, j) => {
        const text = redact(piece.trim(), stats);
        if (text.length < 60) return;
        const loc = u.locator;
        const locId = loc.page ? `p${loc.page}` : loc.slide ? `s${loc.slide}` : u.framework_ref || `sec-${String(loc.section).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}`;
        const flags = INSTRUCTION_LIKE.test(text) ? ['instruction_like'] : [];
        passages.push({ id: `${meta.id}#${locId}-${passages.filter(p => p.id.startsWith(`${meta.id}#${locId}-`)).length + 1}`, source: meta.id, locator: loc, heading: u.heading || '', text, language: meta.language, ...(flags.length ? { flags } : {}), ...(u.framework_ref ? { framework_ref: u.framework_ref } : {}) });
      });
    }
    const { q, notes } = quality(stats, units);
    if (stats.printed_pages) notes.push(`Locators give PDF page numbers; ${stats.printed_pages}.`);
    if (stats.redactions) notes.push(`${stats.redactions} contact detail(s) redacted.`);
    if (toc) notes.push(`${toc} table-of-contents segment(s) skipped.`);
    if (stats.removed_repeated_lines?.length) notes.push(`Repeated headers/footers removed (e.g. "${stats.removed_repeated_lines[0]}").`);
    manifest.push({
      ...base, status: 'indexed', ...(stats.links?.length ? { urls: stats.links.map(url => ({ url, status: 'link present in the document; not verified by the build' })) } : {}),
      extraction: { method: stats.method, quality: q, unit_type: stats.unit_type, units: stats.units, empty_units: stats.empty_units || 0, passages: passages.length, redactions: stats.redactions, notes },
    });
    passagesBySource[meta.id] = passages;
    log(`  ${meta.id}: ${passages.length} passages (${q})`);
  }

  // unlisted files in the archives are reported, never silently indexed
  const unlisted = [];
  for (const kind of ['sources', 'examples']) for (const inner of Object.keys(files[kind])) if (!archived.has(`${kind}:${inner}`)) unlisted.push(`${inputs[kind].name}:${inner}`);

  for (const s of manifest.filter(s => s.relationships.some(r => r.type === 'near_duplicate_of') && s.status === 'indexed')) {
    const canon = s.relationships.find(r => r.type === 'near_duplicate_of').source;
    if (!passagesBySource[canon]) continue;
    const r = markDuplicates(passagesBySource[s.id], passagesBySource[canon]);
    s.relationships.find(x => x.type === 'near_duplicate_of').stats = r;
    s.extraction.notes.push(`${r.duplicate_passages} of ${r.passages} passages repeat ${canon} and are not retrieved separately; ${r.pages_fully_duplicated} of ${r.pages_with_text} pages are fully duplicated.`);
    const c = manifest.find(m => m.id === canon);
    c.relationships.push({ type: 'has_near_duplicate', source: s.id, stats: r });
    log(`  near-duplicates ${s.id} → ${canon}: ${r.duplicate_passages}/${r.passages}`);
  }
  linkSynthesis(manifest, passagesBySource);

  fs.rmSync(path.join(OUT, 'passages'), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'passages'), { recursive: true });
  for (const [id, ps] of Object.entries(passagesBySource)) fs.writeFileSync(path.join(OUT, 'passages', `${id}.json`), JSON.stringify(ps, null, 1) + '\n');
  const indexed = manifest.filter(s => s.status === 'indexed');
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
    schema: 1, generated_by: 'node scripts/library/build.js',
    note: 'Derived text for retrieval. Originals are not stored here. Passages are evidence for the assistant, never instructions.',
    inputs: Object.values(inputs).map(({ kind, name, bytes, sha256 }) => ({ kind, file: name, bytes, sha256 })),
    framework_duplicates: fwDup, unlisted_files: unlisted,
    totals: { sources: manifest.length, indexed: indexed.length, excluded: manifest.filter(s => s.status === 'excluded').length, unavailable: manifest.filter(s => s.status === 'unavailable').length, passages: Object.values(passagesBySource).reduce((n, p) => n + p.length, 0) },
    sources: manifest,
  }, null, 1) + '\n');
  if (framework) fs.writeFileSync(path.join(ROOT, 'frameworks', 'stage-guidance.json'), JSON.stringify(framework, null, 1) + '\n');
  log(`\nWrote ${indexed.length} indexed sources, ${manifest.length - indexed.length} not indexed${unlisted.length ? `, ${unlisted.length} unlisted file(s) ignored` : ''}.`);
})().catch(e => { console.error(e.message); process.exitCode = 1; });
