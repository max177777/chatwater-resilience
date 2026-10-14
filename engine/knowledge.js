/*
 * Knowledge base for retrieval (RAG): ChatWater Help chat, project-plan
 * summary and every proposal section.
 *
 * Corpus
 *   1. ECAM's own variable descriptions (vendor/ecam/languages/en.json), topic "ecam-variables"
 *   2. Every .md / .txt / .pdf / .docx file under /knowledge. The first folder
 *      level is the topic, e.g. knowledge/financing/…, knowledge/plan/…,
 *      knowledge/indonesia/…. Files directly in /knowledge get topic "general".
 *   3. Optional knowledge/sources.json gives each file a proper citation:
 *      { "financing/gcf-water-guidelines-2024.pdf": { "title": "...", "publisher": "...",
 *        "year": 2024, "url": "https://..." } }
 *
 * Scoring is TF-IDF over words (English + Bahasa stop-words removed), with a
 * boost for the topics the caller asks for. No external service is needed;
 * the interface (load / search) can later be backed by embeddings.
 */
const fs = require('fs');
const path = require('path');

const EN = require('../vendor/ecam/languages/en.json');
const DEFAULT_DIR = path.join(__dirname, '..', 'knowledge');
const CHUNK_CHARS = 1200;

const STOP = new Set((
  'the a an of to in and or for is are be by with on at as from this that it its into per during which what how why can do does our we you your i my me not no ' +
  'yang dan di ke dari untuk dengan pada ini itu dalam atau adalah akan oleh juga sebagai tidak ada para bagi telah dapat serta secara'
).split(' '));
const tokenize = s => (s || '').toLowerCase()
  .replace(/<[^>]+>/g, ' ')
  .split(/[^a-z0-9_À-ɏ]+/).filter(w => w.length > 1 && !STOP.has(w));

// ---------------------------------------------------------------- reading files
async function readText(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.md' || ext === '.txt') return fs.readFileSync(file, 'utf8');
  if (ext === '.pdf') {
    const pdf = require('pdf-parse/lib/pdf-parse.js');
    return (await pdf(fs.readFileSync(file))).text;
  }
  if (ext === '.docx') return (await require('mammoth').extractRawText({ path: file })).value;
  return null;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    if (d.name.startsWith('.') || d.name === 'README.md' || d.name === 'sources.json') return [];
    return d.isDirectory() ? walk(p) : [p];
  });
}

/** Split text into ~CHUNK_CHARS pieces on paragraph (then sentence) boundaries, keeping the last heading. */
function chunkText(text) {
  const paras = text.replace(/\r/g, '').split(/\n\s*\n/).map(p => p.replace(/[ \t]+\n/g, '\n').trim()).filter(Boolean);
  const out = [];
  let heading = '', buf = '';
  const flush = () => { if (buf.trim().length >= 60) out.push({ heading, text: buf.trim() }); buf = ''; };
  for (let p of paras) {
    const h = p.match(/^#{1,6}\s+(.+)/);
    if (h) { flush(); heading = h[1].trim(); p = p.replace(/^#{1,6}\s+.+\n?/, ''); if (!p) continue; }
    if (p.length > CHUNK_CHARS) {
      flush();
      const sentences = p.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if ((buf + ' ' + s).length > CHUNK_CHARS) flush();
        buf += (buf ? ' ' : '') + s;
      }
      flush();
      continue;
    }
    if ((buf + '\n\n' + p).length > CHUNK_CHARS) flush();
    buf += (buf ? '\n\n' : '') + p;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------- corpus
let corpus = { chunks: [], df: new Map(), N: 0, documents: [], errors: [] };

function ecamChunks() {
  const codes = new Set(Object.keys(EN)
    .filter(k => /_(descr|expla)$/.test(k))
    .map(k => k.slice(1).replace(/_(descr|expla)$/, '')));
  const chunks = [];
  for (const code of codes) {
    const descr = EN[`#${code}_descr`] || '';
    const expla = EN[`#${code}_expla`] || '';
    if (!descr && !expla) continue;
    chunks.push({ topic: 'ecam-variables', code, title: `ECAM variable ${code}`, text: `${code}: ${descr}. ${expla}`.replace(/<[^>]+>/g, '') });
  }
  return chunks;
}

/** (Re)load the corpus. Safe to call again after adding documents. */
async function load(dir = DEFAULT_DIR) {
  const chunks = ecamChunks();
  const documents = [], errors = [];
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'sources.json'), 'utf8')); } catch (e) {
    if (fs.existsSync(path.join(dir, 'sources.json'))) errors.push({ file: 'sources.json', error: e.message });
  }
  for (const file of walk(dir)) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    let text;
    try { text = await readText(file); } catch (e) { errors.push({ file: rel, error: e.message }); continue; }
    if (text == null) continue; // unsupported extension
    const m = meta[rel] || {};
    const topic = (m.topic || (rel.includes('/') ? rel.split('/')[0] : 'general')).toLowerCase();
    const title = m.title || path.basename(rel).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    const cite = [m.publisher, m.year].filter(Boolean).join(', ');
    const pieces = chunkText(text);
    pieces.forEach((p, i) => chunks.push({
      topic, file: rel, title, cite, url: m.url || null, language: m.language || null,
      heading: p.heading, part: i + 1, text: p.text,
    }));
    documents.push({ file: rel, title, topic, chunks: pieces.length, chars: text.length, url: m.url || null });
    if (!pieces.length) errors.push({ file: rel, error: 'no readable text (scanned PDF? run OCR first)' });
  }
  const df = new Map();
  for (const c of chunks) {
    c.tokens = tokenize(`${c.title} ${c.heading || ''} ${c.text}`);
    for (const w of new Set(c.tokens)) df.set(w, (df.get(w) || 0) + 1);
  }
  corpus = { chunks, df, N: chunks.length, documents, errors };
  return summary();
}

function summary() {
  const byTopic = {};
  for (const d of corpus.documents) byTopic[d.topic] = (byTopic[d.topic] || 0) + 1;
  return { documents: corpus.documents.length, chunks: corpus.N, byTopic, errors: corpus.errors, files: corpus.documents };
}

/**
 * search(query, k) or search(query, { k, topics, only, excludeEcam })
 *   topics: preferred topics (boosted) · only: restrict to these topics
 * Returns [{ title, cite, url, topic, file, heading, text, source }]
 */
function search(query, opts = {}) {
  if (typeof opts === 'number') opts = { k: opts };
  const { k = 6, topics = null, only = null, excludeEcam = false } = opts;
  const q = tokenize(query);
  if (!q.length) return [];
  const mentioned = new Set((query.match(/\bw[sw][a-z]?_[a-z0-9_]+/gi) || []).map(s => s.toLowerCase()));
  const scored = [];
  for (const c of corpus.chunks) {
    if (excludeEcam && c.code) continue;
    if (only && !only.includes(c.topic)) continue;
    let score = 0;
    if (c.code && mentioned.has(c.code)) score += 100;
    const tf = new Map();
    for (const w of c.tokens) tf.set(w, (tf.get(w) || 0) + 1);
    for (const w of q) {
      if (!tf.has(w)) continue;
      score += (1 + Math.log(tf.get(w))) * Math.log(corpus.N / corpus.df.get(w));
    }
    if (!score) continue;
    if (!c.code) score *= 1.5;              // documents written as guidance beat variable labels
    if (topics && topics.includes(c.topic)) score *= 1.6; // caller's preferred topics
    scored.push({ c, score: score / Math.sqrt(1 + c.tokens.length / 40) });
  }
  scored.sort((a, b) => b.score - a.score);
  // many ECAM variables share a description, and long docs repeat themselves: keep distinct text, max 3 chunks per file
  const seen = new Set(), perFile = new Map(), out = [];
  for (const { c } of scored) {
    const body = c.text.replace(/^[a-z0-9_]+:\s*/i, '').slice(0, 200);
    if (seen.has(body)) continue;
    const key = c.file || c.code;
    if ((perFile.get(key) || 0) >= 3) continue;
    seen.add(body); perFile.set(key, (perFile.get(key) || 0) + 1);
    out.push({
      title: c.title, cite: c.cite || '', url: c.url || null, topic: c.topic, file: c.file || null,
      heading: c.heading || '', text: c.text.slice(0, 1500),
      source: c.file ? `${c.title}${c.heading ? ' — ' + c.heading : ''}` : c.title,
    });
    if (out.length >= k) break;
  }
  return out;
}

/** Format retrieved passages for a prompt as [S1] … and return the matching citation list. */
function asSources(passages) {
  const list = passages.map((p, i) => ({ id: `S${i + 1}`, title: p.title, cite: p.cite, url: p.url, heading: p.heading, file: p.file }));
  const block = passages.map((p, i) =>
    `[S${i + 1}] ${p.title}${p.cite ? ` (${p.cite})` : ''}${p.heading ? ` — ${p.heading}` : ''}\n${p.text}`).join('\n\n');
  return { block, list };
}

/** Keep only the sources the text actually cites, in order of first use. */
function citedSources(text, list) {
  const ids = [...new Set((String(text).match(/\[S\d+(?:\s*,\s*S\d+)*\]/g) || [])
    .flatMap(m => m.slice(1, -1).split(/\s*,\s*/)))];
  return ids.map(id => list.find(s => s.id === id)).filter(Boolean);
}

/** ECAM description of one variable (English). */
function describe(code) {
  return { descr: EN[`#${code}_descr`] || code, expla: EN[`#${code}_expla`] || '' };
}

// synchronous first load of ECAM docs + text files so search works immediately;
// server calls load() at start-up to add PDF/Word files.
corpus = (() => {
  const chunks = ecamChunks();
  const df = new Map();
  for (const c of chunks) { c.tokens = tokenize(`${c.title} ${c.text}`); for (const w of new Set(c.tokens)) df.set(w, (df.get(w) || 0) + 1); }
  return { chunks, df, N: chunks.length, documents: [], errors: [] };
})();

module.exports = { load, search, asSources, citedSources, summary, describe, chunkText };
