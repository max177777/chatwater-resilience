#!/usr/bin/env node
/*
 * Builds the open-source document library (all files confirmed open source by the team, Oct 30 2026).
 *
 *   node scripts/library/build-open.js --input-dir <folder that contains "Sources/"> [--output knowledge/library]
 *
 * For every PDF under Sources/ that is described in scripts/library/sources.json (or in the GCF release
 * manifest, whose metadata is more precise), this writes:
 *   knowledge/library/manifest.json            one entry per source (identity, role, caveats, public link)
 *   knowledge/library/passages/<id>.json       page-located passages, the same format as release.js
 *   public/sources/<id>.pdf                    a public copy, so citations open the document at the cited page
 * Text layer only (no OCR). Output has no timestamps, so rebuilding unchanged inputs gives identical files.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const pdf = require('pdf-parse/lib/pdf-parse');
const { chunk, redact } = require('./build');
const library = require('../../engine/library');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2), arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const INPUT = path.resolve(arg('--input-dir', '.'));
const OUT = path.resolve(arg('--output', path.join(ROOT, 'knowledge', 'library')));
const PUBLIC = path.join(ROOT, 'public', 'sources');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

const CFG = require('./sources.json').sources;
const RELEASE = require('./releases/gcf-guidance-v1.json').sources; // precise GCF identities, matched by file hash

function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]); }

async function main() {
  const files = walk(path.join(INPUT, 'Sources')).filter(f => /\.pdf$/i.test(f)).sort();
  if (!files.length) throw new Error('No PDFs found under ' + path.join(INPUT, 'Sources'));
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'passages'), { recursive: true });
  fs.mkdirSync(PUBLIC, { recursive: true });
  const manifest = [], report = [];
  for (const file of files) {
    const rel = path.relative(INPUT, file).split(path.sep).join('/');
    const bytes = fs.readFileSync(file), hash = sha(bytes);
    const rel1 = RELEASE.find(r => r.sha256 === hash);
    let meta = rel1 ? (({ file: _f, identity_terms: _i, pages: _p, url: _u, sha256: _s, ...m }) => m)(rel1) : CFG['sources:' + rel];
    if (!meta) { report.push(`skipped (no metadata): ${rel}`); continue; }
    const pages = [];
    await pdf(bytes, { pagerender: async page => {
      const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      const text = tc.items.map(x => x.str).join(' ').replace(/\s+/g, ' ').trim();
      pages.push({ page: page.pageNumber, text }); return text;
    } });
    pages.sort((a, b) => a.page - b.page);
    const list = [];
    for (const p of pages) for (const [i, text] of chunk(p.text).entries()) {
      const clean = redact(text, { redactions: 0 });
      if (clean.length >= 60) list.push({ id: `${meta.id}#p${p.page}-${i + 1}`, source: meta.id, locator: { page: p.page }, heading: '', text: clean, language: meta.language || 'en' });
    }
    const publicUrl = `/sources/${meta.id}.pdf`;
    fs.writeFileSync(path.join(PUBLIC, meta.id + '.pdf'), bytes);
    const base = { ...meta, public_url: publicUrl, relationships: [], family: meta.id,
      urls: [{ url: publicUrl, status: 'open-source copy hosted by ChatWater (team confirmation, 2026-10-30); pinned by SHA-256' }], sha256: hash, file: rel };
    if (!list.length) { manifest.push({ ...base, status: 'unavailable', extraction: { method: 'pdf-parse text layer; no OCR', quality: 'unavailable', unit_type: 'page', units: pages.length, passages: 0, notes: ['No text layer: scanned PDF.'] } }); report.push(`unavailable (no text layer): ${meta.id}`); continue; }
    fs.writeFileSync(path.join(OUT, 'passages', meta.id + '.json'), JSON.stringify(list, null, 1) + '\n');
    manifest.push({ ...base, status: 'indexed', extraction: { method: 'pdf-parse text layer; no OCR', quality: 'good', unit_type: 'page', units: pages.length, passages: list.length } });
    report.push(`indexed ${String(list.length).padStart(4)} passages · ${pages.length} pages · ${meta.id}`);
  }
  manifest.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ schema: 1, release: 'open-sources-v1', generated_by: 'scripts/library/build-open.js', distribution: 'All sources confirmed open source by the team on 2026-10-30.', sources: manifest }, null, 1) + '\n');
  const summary = library.load(OUT, { verifyRelease: false });
  if (!summary.loaded) throw new Error('Library did not load: ' + summary.error);
  console.log(report.join('\n'));
  console.log(JSON.stringify({ build_id: summary.build_id, sources: summary.sources.filter(s => s.status === 'indexed').length, passages: summary.passages }));
}
main().catch(e => { console.error('Open library build failed: ' + e.message); process.exitCode = 1; });
