/*
 * Bounded Markdown → Word conversion for generated and template text in exports.
 *
 * Supported: ATX headings (# to ####), "-", "*", "+" and "•" bullets (nested by indentation),
 * "1." / "1)" numbered lists, pipe tables with a separator row, **bold** / __bold__,
 * *italic* / _italic_, `code`, [text](url), [S#] citation tags and [To be provided: …] placeholders.
 * Anything else is kept as literal text: asterisks, underscores and hashes that are not markup
 * (2 * 3, snake_case, #5) are never stripped.
 */
const {
  Paragraph, TextRun, ExternalHyperlink, Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, VerticalAlign, TableLayoutType, HeadingLevel, TableBorders,
} = require('docx');

const STAGE_CODES = ['wsa', 'wst', 'wsd', 'wwc', 'wwt', 'wwo'];
const PLACEHOLDER = /\[(?:To be provided|To be completed|Perlu disediakan|Perlu dilengkapi)\b[^\]]*\]/;

// ------------------------------------------------------------------ text clean-up (display only)
/** CO₂, CH₄, N₂O and m³ in running text; identifiers such as A02 or wsd_vol_dist are left alone. */
function chem(s) {
  return String(s)
    .replace(/\b(t|kg|Mt|g)?CO2(e|eq)?\b/g, (_, p = '', e = '') => `${p}CO₂${e}`)
    .replace(/\bCH4\b/g, 'CH₄').replace(/\bN2O\b/g, 'N₂O')
    .replace(/(\d|\b)\s?m3\b/g, (m, d) => m.replace('m3', 'm³'))
    .replace(/\/m3\b/g, '/m³');
}
/**
 * Internal ECAM stage codes in narrative: "(wwo)" after a name is dropped, a bare code is replaced by
 * the stage name. Codes inside identifiers (wsd_vol_dist) do not match.
 */
function stageNames(s, names) {
  if (!names) return s;
  const codes = STAGE_CODES.join('|');
  return String(s)
    .replace(new RegExp(`\\s*\\((?:${codes})\\)`, 'g'), '')
    .replace(new RegExp(`(?<![\\w/])(${codes})(?![\\w/])`, 'g'), (m, c) => names[c] || m);
}

// ------------------------------------------------------------------ inline parsing
// One token per match; the inner text of bold and italic is parsed again (one level of nesting).
const INLINE = new RegExp([
  '`(?<code>[^`\\n]+)`',
  '(?<placeholder>\\[(?:To be provided|To be completed|Perlu disediakan|Perlu dilengkapi)\\b[^\\]]*\\])',
  '(?<tag>\\[S\\d+\\])',
  '\\[(?<label>[^\\]\\n]+)\\]\\((?<url>https?:\\/\\/[^)\\s]+)\\)',
  '\\*\\*\\*(?=\\S)(?<both>[^*\\n]+?)(?<=\\S)\\*\\*\\*',
  '\\*\\*(?=\\S)(?<bold>[^*\\n]+?(?:\\*(?!\\*)[^*\\n]+?)*)(?<=\\S)\\*\\*',
  '(?<![\\w_])__(?=\\S)(?<bold2>[^_\\n]+?)(?<=\\S)__(?![\\w_])',
  '(?<![\\w*])\\*(?=[^\\s*])(?<italic>[^*\\n]+?)(?<=[^\\s*])\\*(?![\\w*])',
  '(?<![\\w_])_(?=[^\\s_])(?<italic2>[^_\\n]+?)(?<=[^\\s_])_(?![\\w_])',
].join('|'), 'g');

/** "**a** and *b*" → [{ text: 'a', bold: true }, { text: ' and ' }, { text: 'b', italic: true }] */
function inline(src, base = {}) {
  const out = [];
  const s = String(src ?? '');
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    const g = m.groups;
    if (m.index > last) out.push({ ...base, text: s.slice(last, m.index) });
    if (g.code) out.push({ ...base, text: g.code, code: true });
    else if (g.placeholder) out.push({ ...base, text: g.placeholder, placeholder: true });
    else if (g.tag) out.push({ ...base, text: g.tag, tag: true });
    else if (g.label) out.push({ ...base, text: g.label, link: g.url });
    else if (g.both) out.push({ ...base, text: g.both, bold: true, italic: true });
    else if (g.bold || g.bold2) out.push(...inline(g.bold || g.bold2, { ...base, bold: true }));
    else if (g.italic || g.italic2) out.push(...inline(g.italic || g.italic2, { ...base, italic: true }));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ ...base, text: s.slice(last) });
  return out.filter(r => r.text !== '');
}

// ------------------------------------------------------------------ block parsing
const isTableRow = l => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = l => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));

/**
 * Blocks: { type: 'heading', level, text } | { type: 'para', text, blockEnd } | { type: 'bullet', level, text }
 *         | { type: 'number', level, text, list } | { type: 'table', header, rows }
 * "list" numbers each separate numbered list so that its numbering restarts.
 */
function parse(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let list = 0, inNumbered = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const l = raw.trim();
    if (!l) { if (blocks.length) blocks[blocks.length - 1].blockEnd = true; continue; }
    if (isTableRow(l) && i + 1 < lines.length && isTableSep(lines[i + 1].trim())) {
      const header = cells(l);
      const rows = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i].trim())) rows.push(cells(lines[i++]));
      i--;
      const n = header.length;
      blocks.push({ type: 'table', header, rows: rows.map(r => Array.from({ length: n }, (_, k) => r[k] ?? '')) });
      inNumbered = false;
      continue;
    }
    const indent = raw.match(/^\s*/)[0].replace(/\t/g, '  ').length;
    const level = Math.min(2, Math.floor(indent / 2));
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/))) { blocks.push({ type: 'heading', level: m[1].length, text: m[2] }); inNumbered = false; continue; }
    if ((m = l.match(/^[-*+•]\s+(.*)$/))) { blocks.push({ type: 'bullet', level, text: m[1] }); continue; }
    if ((m = l.match(/^\d{1,3}[.)]\s+(.*)$/))) {
      if (!inNumbered) { list++; inNumbered = true; }
      blocks.push({ type: 'number', level, text: m[1], list });
      continue;
    }
    // a list item's continuation lines stay with the item
    const prev = blocks[blocks.length - 1];
    if (prev && !prev.blockEnd && (prev.type === 'bullet' || prev.type === 'number') && indent >= 2) { prev.text += ' ' + l; continue; }
    blocks.push({ type: 'para', text: l });
    if (level === 0) inNumbered = false;
  }
  return blocks;
}

// ------------------------------------------------------------------ duplicate titles
const norm = s => String(s || '').replace(/[*_`#]/g, '').toLowerCase()
  .replace(/^\s*(?:[a-z]\d{0,2}|\d{1,2})[.)]\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Remove an opening heading (or a bold or plain first line) that only repeats the section title. */
function dropDuplicateTitle(blocks, title) {
  const first = blocks[0];
  if (!first || !title) return blocks;
  const candidate = first.type === 'heading' || (first.type === 'para' && first.text.length <= 120);
  return candidate && norm(first.text) === norm(title) && norm(title) ? blocks.slice(1) : blocks;
}

// ------------------------------------------------------------------ Word output
const FONT = 'Calibri';
const COLORS = { accent: '1F5F66', muted: '555555', border: 'BFC9CC', head: '1F5F66', placeholderText: '7A4B00', placeholderFill: 'FFF1CC' };
const SIZE = { body: 22, note: 19, table: 19, tableNote: 18 };

/** Runs for one line of text; display clean-up applies to text runs only, never to code. */
function runs(text, opts = {}) {
  const clean = s => chem(stageNames(s, opts.stageNames));
  return inline(text).map(r => {
    const base = { text: r.code ? r.text : clean(r.text), bold: r.bold || opts.bold, italics: r.italic || opts.italics, size: opts.size, color: opts.color, font: r.code ? 'Consolas' : undefined };
    if (r.placeholder) return new TextRun({ ...base, italics: true, color: COLORS.placeholderText, shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLORS.placeholderFill } });
    if (r.link) return new ExternalHyperlink({ link: r.link, children: [new TextRun({ ...base, style: 'Hyperlink' })] });
    return new TextRun(base);
  });
}

const border = { style: BorderStyle.SINGLE, size: 4, color: COLORS.border };
const borders = { top: border, bottom: border, left: border, right: border };
const isNumeric = s => { const v = String(s).replace(/\*/g, '').trim(); return /^[−–-]?[\d.,\s]+%?$/.test(v) && /\d/.test(v); };
/**
 * A table that repeats its header row on each page and does not split rows across pages.
 * cellsOf: string or array of strings (first line main text, the rest smaller notes); markdown is allowed.
 */
function table(headers, rows, widths, opts = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (value, i, head) => new TableCell({
    borders, width: { size: widths[i], type: WidthType.DXA }, verticalAlign: head ? VerticalAlign.CENTER : VerticalAlign.TOP,
    shading: head ? { fill: COLORS.head, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: (Array.isArray(value) ? value : [value]).map((line, n) => new Paragraph({
      spacing: { before: 0, after: n || Array.isArray(value) ? 40 : 0, line: 260 },
      alignment: !head && isNumeric(line) ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: head ? [new TextRun({ text: chem(String(line ?? '')), bold: true, color: 'FFFFFF', size: SIZE.table })]
        : runs(String(line ?? ''), { size: n ? SIZE.tableNote : SIZE.table, color: n ? COLORS.muted : undefined, stageNames: opts.stageNames }),
    })),
  });
  // opts.caption: a borderless first header row, so the caption cannot be separated from a table longer
  // than a page (some renderers strand a keep-with-next caption before such a table) and repeats on each page
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const captionRow = opts.caption ? [new TableRow({ tableHeader: true, cantSplit: true, children: [new TableCell({
    columnSpan: widths.length, width: { size: total, type: WidthType.DXA },
    borders: { top: none, left: none, right: none, bottom: border }, margins: { top: 0, bottom: 80, left: 0, right: 0 },
    children: [new Paragraph({ children: [new TextRun({ text: chem(opts.caption), bold: true, size: 21, color: COLORS.accent })] })] })] })] : [];
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: TableBorders.NONE,
    rows: [...captionRow, new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map(r => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) }))],
  });
}

/** Column widths for a generated table: proportional to content length, within limits. */
function autoWidths(header, rows, total) {
  const n = header.length;
  const len = header.map((h, k) => Math.max(String(h).length, ...rows.map(r => Math.min(60, String(r[k] || '').length))) + 4);
  const sum = len.reduce((a, b) => a + b, 0);
  const min = Math.min(1100, Math.floor(total / n));
  const w = len.map(l => Math.max(min, Math.round(total * l / sum)));
  const scale = total / w.reduce((a, b) => a + b, 0);
  const out = w.map(x => Math.floor(x * scale));
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

const HEADINGS = [HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
/**
 * Word paragraphs and tables for one section's text.
 * opts: { title (drops a duplicate opening title), stageNames, numbering (reference), listBase (first list
 * instance number, so numbering restarts across sections), contentWidth (DXA) }
 * Returns { children, lists } where lists is the number of numbered lists used.
 */
function toDocx(text, opts = {}) {
  let blocks = parse(text);
  if (opts.title) blocks = dropDuplicateTitle(blocks, opts.title);
  const minLevel = Math.min(...blocks.filter(b => b.type === 'heading').map(b => b.level), 9);
  const children = [];
  const ro = { stageNames: opts.stageNames, size: SIZE.body };
  blocks.forEach((b, i) => {
    const next = blocks[i + 1];
    const leadsIn = !!next && (next.type === 'bullet' || next.type === 'number' || next.type === 'table');
    if (b.type === 'heading') {
      children.push(new Paragraph({ heading: HEADINGS[Math.min(2, b.level - minLevel)], keepNext: true, keepLines: true, children: runs(b.text, { stageNames: opts.stageNames }) }));
    } else if (b.type === 'bullet') {
      children.push(new Paragraph({ bullet: { level: b.level }, spacing: { after: next && next.type === 'bullet' ? 40 : 120, line: 276 }, children: runs(b.text, ro) }));
    } else if (b.type === 'number') {
      children.push(new Paragraph({ numbering: { reference: opts.numbering || 'cw-numbered', level: b.level, instance: (opts.listBase || 0) + b.list },
        spacing: { after: next && next.type === 'number' ? 40 : 120, line: 276 }, children: runs(b.text, ro) }));
    } else if (b.type === 'table') {
      const width = opts.contentWidth || 9306;
      children.push(table(b.header, b.rows, autoWidths(b.header, b.rows, width), { stageNames: opts.stageNames }));
      children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    } else {
      // a short line that is entirely bold reads as a subheading: keep it with what follows
      const onlyBold = /^\*\*[^*]+\*\*:?$/.test(b.text) && b.text.length <= 100;
      children.push(new Paragraph({ keepNext: onlyBold || leadsIn || /:\s*$/.test(b.text), spacing: { after: b.blockEnd || !next ? 160 : 80, line: 276 }, children: runs(b.text, ro) }));
    }
  });
  return { children, lists: blocks.reduce((m, b) => b.type === 'number' ? Math.max(m, b.list) : m, 0) };
}

/** Numbering definition for numbered lists (decimal, then lower-letter, then lower-roman). */
const NUMBERING = {
  reference: 'cw-numbered',
  levels: ['%1.', '%2.', '%3.'].map((text, level) => ({
    level, format: ['decimal', 'lowerLetter', 'lowerRoman'][level], text, alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 360 * (level + 1) + 360, hanging: 360 } } },
  })),
};

module.exports = { normTitle: norm, parse, inline, toDocx, dropDuplicateTitle, table, chem, stageNames, NUMBERING, PLACEHOLDER, FONT, COLORS, SIZE };
