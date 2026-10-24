/*
 * Document library: passages produced by scripts/library/build.js
 * (knowledge/library/manifest.json + passages/*.json). Callers go through
 * engine/retrieval.js, which builds queries and formats evidence.
 *
 * Scoring is BM25 over words with a small EN↔ID glossary expansion and
 * boosts for the current stage. Every result carries its source ID, locator,
 * role, review status, caveats and the qualifications attached to it at
 * build time. Retrieved text is evidence, never instructions.
 * build_id is a hash of the manifest and passage files, so saved outputs can
 * say which library version their evidence came from.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// generated and git-ignored; CHATWATER_LIBRARY_DIR points elsewhere (e.g. to simulate a checkout without it)
const DEFAULT_DIR = process.env.CHATWATER_LIBRARY_DIR ? path.resolve(process.env.CHATWATER_LIBRARY_DIR) : path.join(__dirname, '..', 'knowledge', 'library');

const STOP = new Set((
  'the a an of to in and or for is are be by with on at as from this that it its into per during which what how why can do does our we you your i my me not no ' +
  'should would could will shall may might must has have had was were been being there their them they these those than then so if about any all also more most ' +
  'use used using us one two ' +
  'yang dan di ke dari untuk dengan pada ini itu dalam atau adalah akan oleh juga sebagai tidak ada para bagi telah dapat serta secara apa bagaimana mengapa ' +
  'kami kita saya anda harus bisa sudah belum lebih jika agar maka karena tersebut hal'
).split(' '));

const stem = w => (w.length > 4 && /[^s]s$/.test(w) ? w.slice(0, -1) : w);
const tokenize = s => (s || '').toLowerCase()
  .replace(/wire[\s-]+to[\s-]+water/g, 'wiretowater')
  .split(/[^a-z0-9À-ɏ]+/).filter(w => w.length > 1 && !STOP.has(w)).map(stem);

/* EN↔ID terminology. Each group is one concept; any member in a question also searches the others. */
const GLOSSARY = [
  ['pump', 'pompa', 'pumping', 'pemompaan'], ['efficiency', 'efisiensi', 'efficient', 'efisien'],
  ['energy', 'energi'], ['electricity', 'listrik', 'electrical', 'kwh'], ['motor', 'motors'],
  ['wiretowater', 'overall', 'keseluruhan'], ['boundary', 'batas', 'boundaries'],
  ['measurement', 'pengukuran', 'measure', 'measured', 'ukur', 'diukur', 'metering', 'meter'],
  ['flow', 'debit', 'aliran'], ['power', 'daya'], ['head', 'tinggi'], ['sec', 'specific'],
  ['water', 'air'], ['wastewater', 'limbah'], ['sanitation', 'sanitasi'],
  ['septic', 'septik', 'tangki'], ['containment', 'penampungan', 'contained', 'tank'],
  ['sludge', 'lumpur', 'tinja', 'faecal', 'fecal'], ['desludging', 'penyedotan', 'pengurasan', 'emptying'],
  ['leak', 'kebocoran', 'bocor', 'leakage', 'loss', 'kehilangan', 'nrw'], ['direct', 'langsung'], ['scope', 'cakupan'],
  ['repair', 'perbaikan', 'rehabilitation', 'rehabilitasi', 'replacement', 'penggantian'],
  ['financing', 'pembiayaan', 'pendanaan', 'funding', 'finance', 'dana', 'fund', 'membiayai', 'dibiayai', 'mendanai', 'didanai'],
  ['cost', 'biaya', 'capex', 'investment', 'investasi'], ['grant', 'hibah'], ['loan', 'pinjaman'],
  ['eligibility', 'eligible', 'kelayakan', 'layak', 'criteria', 'kriteria', 'syarat', 'persyaratan', 'requirement'],
  ['monitoring', 'pemantauan', 'monitor', 'evaluasi', 'evaluation'], ['indicator', 'indikator'],
  ['baseline', 'dasar', 'existing', 'current', 'kondisi'], ['data', 'information', 'informasi'],
  ['emission', 'emisi', 'ghg', 'greenhouse'], ['methane', 'metana', 'ch4'], ['climate', 'iklim'],
  ['flood', 'banjir', 'flooding'], ['drought', 'kekeringan'], ['risk', 'risiko', 'hazard', 'bahaya'],
  ['treatment', 'pengolahan', 'ipal', 'wwtp'], ['distribution', 'distribusi'], ['abstraction', 'intake', 'pengambilan'],
  ['plan', 'rencana', 'perencanaan', 'planning'], ['project', 'proyek', 'kegiatan'],
  ['regulation', 'peraturan', 'regulasi', 'permen'], ['utility', 'pdam', 'perumda', 'operator'],
  ['solar', 'surya', 'pv'], ['biogas'], ['connection', 'sambungan'], ['target', 'sasaran'],
  // added after the first run of test/eval/library-eval.json (tuned on that set)
  ['safety', 'pengamanan', 'keamanan', 'aman'], ['variability', 'variabilitas'], ['drinking', 'minum'],
].map(g => g.map(stem));
const SYN = new Map();
for (const g of GLOSSARY) for (const w of g) SYN.set(w, [...new Set([...(SYN.get(w) || []), ...g])]);

// set from the section queries' score distribution (see test/eval/library-eval-runs.json, run 3)
const SCOPED_MIN_SHARE = 0.6;

/* Words that show a passage concerns water supply or sanitation (EN/ID); used for multi-sector sources only. */
const SECTOR_WORDS = new Set(tokenize('water air drinking minum sanitation sanitasi wastewater limbah sewer sewerage sludge lumpur tinja septic septik desludging ' +
  'pdam perumda utility utilities pump pompa wash ipal iplt spam wwtp'));

const ROLE_NOTE = {
  team_framework: 'ChatWater team framework (draft, awaiting team review).',
  methodology: 'Methodology reference.',
  guidance: 'External guidance.',
  regulation: 'Regulatory text; current legal status not verified.',
  training_example: 'Training material: illustrative, not facts about this utility.',
  derived_synthesis: 'Derived synthesis prepared from training decks; not scientifically reviewed.',
};

let lib = empty();
function empty() { return { dir: null, manifest: null, build_id: null, sources: new Map(), passages: [], byId: new Map(), df: new Map(), N: 0, avgLen: 1, quals: new Map(), skipped: 0, error: null }; }

/** Load the built library. Missing library → empty index with an error note. */
function load(dir = DEFAULT_DIR) {
  const next = empty();
  next.dir = dir;
  const hash = crypto.createHash('sha256');
  try {
    const text = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8');
    hash.update(text);
    next.manifest = JSON.parse(text);
  } catch (e) {
    next.error = fs.existsSync(dir) ? `manifest unreadable: ${e.message}` : 'library not built (run node scripts/library/build.js)';
    lib = next;
    return summary();
  }
  for (const s of next.manifest.sources) {
    next.sources.set(s.id, s);
    for (const q of s.qualifications || []) next.quals.set(`${s.id}:${q.id}`, q);
  }
  const alsoIn = new Map();
  for (const s of next.manifest.sources) {
    if (s.status !== 'indexed') continue;
    let list;
    try {
      const text = fs.readFileSync(path.join(dir, 'passages', `${s.id}.json`), 'utf8');
      hash.update(text);
      list = JSON.parse(text);
    } catch (e) { s.load_error = e.message; continue; }
    for (const p of list) {
      next.byId.set(p.id, p);
      if (p.duplicate_of) { next.skipped++; (alsoIn.get(p.duplicate_of) || alsoIn.set(p.duplicate_of, []).get(p.duplicate_of)).push(p.id); continue; }
      p.tokens = tokenize(`${p.heading || ''} ${p.text}`);
      p.tf = new Map();
      for (const w of p.tokens) p.tf.set(w, (p.tf.get(w) || 0) + 1);
      for (const w of p.tf.keys()) next.df.set(w, (next.df.get(w) || 0) + 1);
      p.water = [...SECTOR_WORDS].some(w => p.tf.has(w));
      next.passages.push(p);
    }
  }
  for (const [id, dups] of alsoIn) { const p = next.byId.get(id); if (p) p.also_in = dups; }
  next.N = next.passages.length;
  next.avgLen = next.passages.reduce((a, p) => a + p.tokens.length, 0) / (next.N || 1);
  next.build_id = 'lib-' + hash.digest('hex').slice(0, 12);
  lib = next;
  return summary();
}

function buildId() { return lib.build_id; }

function summary() {
  if (!lib.manifest) return { loaded: false, error: lib.error, sources: 0, passages: 0, build_id: null };
  return {
    loaded: true, build_id: lib.build_id, passages: lib.N, duplicates_not_indexed: lib.skipped,
    sources: lib.manifest.sources.map(s => ({
      id: s.id, title: s.title, status: s.status, role: s.role, language: s.language,
      quality: s.extraction?.quality || null, passages: s.extraction?.passages || 0,
    })),
  };
}

function locatorLabel(loc = {}) {
  if (loc.page) return `p. ${loc.page}${loc.printed_page ? ` (printed p. ${loc.printed_page})` : ''}`;
  if (loc.slide) return `slide ${loc.slide}`;
  if (loc.section) return `section “${loc.section}”`;
  return '';
}

/** Sources that are not independent of each other share a root (translation pairs, near-duplicates, a synthesis and its decks). */
function rootOf(sourceId) {
  const s = lib.sources.get(sourceId);
  if (!s) return sourceId;
  const syn = (s.relationships || []).find(r => r.type === 'synthesised_in');
  if (syn) return rootOf(syn.source);
  return s.family || s.id;
}

function qualification(sourceId, qid) {
  const own = lib.quals.get(`${sourceId}:${qid}`);
  if (own) return { ...own, from: sourceId };
  const s = lib.sources.get(sourceId);
  const syn = (s?.relationships || []).find(r => r.type === 'synthesised_in');
  if (syn) { const q = lib.quals.get(`${syn.source}:${qid}`); if (q) return { ...q, from: syn.source }; }
  return null;
}

/** Public view of one passage: exact text plus everything needed to inspect it. */
function view(p, extra = {}) {
  const s = lib.sources.get(p.source) || {};
  const quals = (p.qualifications || []).map(q => qualification(p.source, q)).filter(Boolean)
    .map(q => ({ id: q.id, title: q.title, locator: q.locator, source: q.from, text: q.text }));
  const warnings = [];
  if (ROLE_NOTE[s.role]) warnings.push(ROLE_NOTE[s.role]);
  for (const c of s.caveats || []) warnings.push(c);
  if (s.extraction?.quality && s.extraction.quality !== 'good') warnings.push(`Extraction quality: ${s.extraction.quality}. ${(s.extraction.notes || [])[0] || ''}`.trim());
  if ((p.flags || []).includes('instruction_like')) warnings.push('Contains instruction-like wording; treated as quoted text only.');
  return {
    id: p.id, sourceId: p.source, title: s.title || p.source, publisher: s.publisher || null, date: s.date || null,
    role: s.role || null, review_status: s.review_status || null, language: p.language || s.language || null,
    locator: p.locator, locatorLabel: locatorLabel(p.locator), heading: p.heading || '', text: p.text,
    qualifications: quals, warnings, flags: p.flags || [],
    framework_ref: p.framework_ref || null, derived_from: p.derived_from || null, also_in: p.also_in || null,
    root: rootOf(p.source), ...extra,
  };
}

/**
 * retrieve(query, { stage, context, k, sources, minCoverage, scoped })
 *   stage: 2|3|4 boosts sources tagged for that stage · context: extra terms from the focused item (weighted lower)
 *   scoped: for generated queries (section purpose, plan). A passage from a multi-sector source is then used
 *   only if that source is tagged for this stage or the passage concerns water or sanitation, so generic
 *   wording ("implementation plan phases") does not pull in another sector's programme; weak matches
 *   (below SCOPED_MIN_SHARE) are dropped. Typed questions are not scoped.
 * Returns { status: 'found'|'none', passages, terms, reason }.
 * 'none' means no passage cleared the relevance threshold — the UI says "No supporting passage found".
 * Status 'unavailable' means the library is not built or unreadable; that is not the same as "no passage found".
 */
function retrieve(query, opts = {}) {
  const { stage = null, context = '', k = 5, sources = null, minCoverage = 0.5, minScore = 4, scoped = false } = opts;
  const qTokens = [...new Set(tokenize(query))];
  const ctxTokens = [...new Set(tokenize(context))].filter(w => !qTokens.includes(w));
  if (!lib.manifest) return { status: 'unavailable', passages: [], terms: qTokens, reason: lib.error || 'library not built' };
  if (!lib.N) return { status: 'none', passages: [], terms: qTokens, reason: 'library has no indexed passages' };
  if (!qTokens.length) return { status: 'none', passages: [], terms: [], reason: 'no searchable words in the question' };

  const k1 = 1.2, b = 0.75;
  const idf = w => Math.log(1 + (lib.N - (lib.df.get(w) || 0) + 0.5) / ((lib.df.get(w) || 0) + 0.5));
  // concepts: each question word with its glossary equivalents, weighted by rarity; a word absent from
  // the library keeps the highest weight, so off-topic questions cannot pass on common words alone
  const concepts = qTokens.map(w => {
    const forms = SYN.get(w) || [w];
    const known = forms.filter(f => lib.df.has(f));
    return { w, forms, idf: known.length ? Math.max(...known.map(idf)) : idf('\u0000') };
  });
  const totalIdf = concepts.reduce((a, c) => a + c.idf, 0);
  const weight = new Map();
  for (const c of concepts) for (const f of c.forms) if (lib.df.has(f)) weight.set(f, Math.max(weight.get(f) || 0, f === c.w ? 1 : 0.7));
  for (const w of ctxTokens) for (const f of SYN.get(w) || [w]) if (!weight.has(f) && lib.df.has(f)) weight.set(f, 0.35);
  if (!weight.size) return { status: 'none', passages: [], terms: qTokens, reason: 'none of the question words occur in the library' };
  const scored = [];
  for (const p of lib.passages) {
    if (sources && !sources.includes(p.source)) continue;
    if (scoped && !p.water) {
      const src = lib.sources.get(p.source) || {};
      if (src.sector === 'multi-sector' && !(stage && (src.stages || []).includes(+stage))) continue;
    }
    let score = 0;
    for (const [w, wt] of weight) {
      const tf = p.tf.get(w);
      if (!tf) continue;
      score += wt * idf(w) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * p.tokens.length / lib.avgLen));
    }
    if (!score) continue;
    const covered = concepts.filter(c => c.forms.some(f => p.tf.has(f))).reduce((a, c) => a + c.idf, 0) / totalIdf;
    const s = lib.sources.get(p.source) || {};
    if (stage && (s.stages || []).includes(+stage)) score *= 1.25;
    if (p.framework_ref && stage && String(p.framework_ref).startsWith(`s${stage}`)) score *= 1.2;
    score *= 0.6 + 0.4 * covered;
    // generated queries are short keyword lists: below this share of a single-mention match on every
    // term, a passage shares only generic wording with the purpose, so fewer passages are returned
    if (scoped && score < SCOPED_MIN_SHARE * totalIdf) continue;
    scored.push({ p, score, covered });
  }
  scored.sort((a, b) => b.score - a.score);
  const passing = scored.filter(x => x.covered >= minCoverage && x.score >= minScore);
  if (!passing.length) {
    const best = scored[0];
    return { status: 'none', passages: [], terms: qTokens, reason: best ? `best match covered ${Math.round(best.covered * 100)}% of the question terms` : 'no passage shares terms with the question' };
  }
  const perSource = new Map(), out = [], rootsSeen = new Map();
  for (const x of passing) {
    if ((perSource.get(x.p.source) || 0) >= 2) continue;
    perSource.set(x.p.source, (perSource.get(x.p.source) || 0) + 1);
    const v = view(x.p, { score: +x.score.toFixed(2), coverage: +x.covered.toFixed(2) });
    v.independent = !rootsSeen.has(v.root);
    if (!v.independent) v.related_to = rootsSeen.get(v.root);
    else rootsSeen.set(v.root, v.id);
    out.push(v);
    if (out.length >= k) break;
  }
  return { status: 'found', passages: out, terms: qTokens, independent_roots: rootsSeen.size };
}

/** Prompt block: each passage delimited and labelled as untrusted evidence. */
function evidenceBlock(passages) {
  return passages.map((p, i) => {
    const head = `[S${i + 1}] source_id=${p.sourceId} | ${p.title}${p.publisher ? ` | ${p.publisher}` : ''} | ${p.locatorLabel} | role=${p.role}${p.independent === false ? ` | not independent of ${p.related_to}` : ''}`;
    const notes = [...p.warnings, ...p.qualifications.map(q => `Qualification ${q.id} (${q.title}): ${q.text.slice(0, 500)}`)];
    return `<evidence id="S${i + 1}">\n${head}\n${notes.length ? `Warnings: ${notes.join(' | ')}\n` : ''}Text: """${p.text.replace(/"""/g, '"')}"""\n</evidence>`;
  }).join('\n\n');
}

/**
 * Lexical support check for citations: for each sentence citing [Sn], the share of its content words
 * found in that passage. This is word overlap, not a judgement of whether the passage supports the claim.
 */
function supportCheck(text, passages) {
  const out = [];
  for (const sentence of String(text).split(/(?<=[.!?])\s+/)) {
    const ids = [...new Set((sentence.match(/\[S\d+(?:\s*,\s*S\d+)*\]/g) || []).flatMap(m => m.slice(1, -1).split(/\s*,\s*/)))];
    if (!ids.length) continue;
    const words = [...new Set(tokenize(sentence.replace(/\[S\d+[^\]]*\]/g, '')))];
    for (const id of ids) {
      const p = passages[+id.slice(1) - 1];
      if (!p) { out.push({ id, sentence, status: 'unknown_source' }); continue; }
      const toks = new Set(tokenize(`${p.heading} ${p.text}`));
      const hit = words.filter(w => (SYN.get(w) || [w]).some(f => toks.has(f))).length;
      const overlap = words.length ? hit / words.length : 0;
      out.push({ id, sourceId: p.sourceId, sentence, overlap: +overlap.toFixed(2), status: overlap >= 0.3 ? 'word_overlap' : 'low_overlap' });
    }
  }
  return out;
}

function source(id) { return lib.sources.get(id) || null; }
function passage(id) { const p = lib.byId.get(id); return p ? view(p) : null; }

load();

module.exports = { DEFAULT_DIR, load, summary, buildId, retrieve, evidenceBlock, supportCheck, source, passage, locatorLabel, tokenize, GLOSSARY };
