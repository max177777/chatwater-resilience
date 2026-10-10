/*
 * Retrieval for the ChatWater Help chat (first version of the RAG system).
 *
 * Corpus:
 *   1. ECAM's own variable descriptions and explanations (vendor/ecam/languages/en.json)
 *   2. Markdown files in /knowledge (ECAM guideline notes, funding guides, ...)
 *      — the team adds documents here; each paragraph becomes a chunk.
 * Scoring is TF-IDF over words; good enough for a few thousand chunks and has
 * no external dependency. Swap for embeddings later without changing callers.
 */
const fs = require('fs');
const path = require('path');

const EN = require('../vendor/ecam/languages/en.json');
const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');

const STOP = new Set('the a an of to in and or for is are be by with on at as from this that it its into per during which what how why can do does our we you your i my me'.split(' '));
const tokenize = s => (s || '').toLowerCase()
  .replace(/<[^>]+>/g, ' ')
  .split(/[^a-z0-9_]+/).filter(w => w.length > 1 && !STOP.has(w));

function buildCorpus() {
  const chunks = [];
  // ECAM variable docs, grouped per code
  const codes = new Set(Object.keys(EN)
    .filter(k => /_(descr|expla)$/.test(k))
    .map(k => k.slice(1).replace(/_(descr|expla)$/, '')));
  for (const code of codes) {
    const descr = EN[`#${code}_descr`] || '';
    const expla = EN[`#${code}_expla`] || '';
    if (!descr && !expla) continue;
    chunks.push({ source: `ECAM variable ${code}`, code, text: `${code}: ${descr}. ${expla}`.replace(/<[^>]+>/g, '') });
  }
  // team-provided documents
  if (fs.existsSync(KNOWLEDGE_DIR)) {
    for (const f of fs.readdirSync(KNOWLEDGE_DIR).filter(f => /\.(md|txt)$/.test(f))) {
      const txt = fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf8');
      let heading = f;
      for (const para of txt.split(/\n\s*\n/)) {
        const h = para.match(/^#+\s+(.*)/);
        if (h) heading = h[1];
        if (para.trim().length < 40) continue;
        chunks.push({ source: `${f} — ${heading}`, text: para.trim() });
      }
    }
  }
  // index
  const df = new Map();
  for (const c of chunks) {
    c.tokens = tokenize(c.text);
    for (const w of new Set(c.tokens)) df.set(w, (df.get(w) || 0) + 1);
  }
  return { chunks, df, N: chunks.length };
}

let corpus = buildCorpus();

function search(query, k = 6) {
  const q = tokenize(query);
  const mentioned = new Set((query.match(/\bw[sw][a-z]?_[a-z0-9_]+/gi) || []).map(s => s.toLowerCase()));
  const scored = corpus.chunks.map(c => {
    let score = 0;
    if (c.code && mentioned.has(c.code)) score += 100;
    const tf = new Map();
    for (const w of c.tokens) tf.set(w, (tf.get(w) || 0) + 1);
    for (const w of q) {
      if (!tf.has(w)) continue;
      score += (1 + Math.log(tf.get(w))) * Math.log(corpus.N / corpus.df.get(w));
    }
    if (!c.code) score *= 1.5; // team documents are written as guidance, prefer them
    return { c, score: score / Math.sqrt(1 + c.tokens.length / 30) };
  }).filter(x => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  // many ECAM variables share one description (e.g. *_conv_kwh in every stage): keep one
  const seen = new Set(), out = [];
  for (const x of scored) {
    const body = x.c.text.replace(/^[a-z0-9_]+:\s*/i, '');
    if (seen.has(body)) continue;
    seen.add(body); out.push({ source: x.c.source, text: x.c.text.slice(0, 1200) });
    if (out.length >= k) break;
  }
  return out;
}

/** ECAM description of one variable in a language (falls back to English). */
function describe(code) {
  return { descr: EN[`#${code}_descr`] || code, expla: EN[`#${code}_expla`] || '' };
}

module.exports = { search, describe, reload: () => { corpus = buildCorpus(); return corpus.N; } };
