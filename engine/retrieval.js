/*
 * Shared retrieval service for every assistance feature: context chat, Explain with AI,
 * the plan summary and proposal sections. All of them search the document library
 * (engine/library.js) through here, so source metadata, locators, qualifications,
 * duplicate handling and the "no supporting passage" outcome are the same everywhere.
 *
 * Project facts never come from here: they come from the ECAM recalculation in each
 * caller. A request with no matching passage still gets its project data; the prompt
 * just says that no document evidence was found.
 *
 * Citation checks are kept apart on purpose:
 *   tag valid     the [S#] tag points to a passage retrieved for this text
 *   word overlap  share of the citing sentence's words found in that passage (lexical only)
 *   support       not verified: nothing here checks that the passage supports the claim
 */
const library = require('./library');
const GUIDE = require('../frameworks/stage-guidance.json');

const MAX_PASSAGES = 5;
const MAX_QUERIES = 4;
const NO_PASSAGE = '(No supporting passage found in the document library for this request. Project facts are still in DATA. For any document claim, write a [To be provided: …] placeholder instead of citing.)';
const LIBRARY_UNAVAILABLE = '(The document library is not built on this server, so no documents were searched. This is not evidence that the documents say nothing. Project facts are still in DATA. For any document claim, write a [To be provided: …] placeholder instead of citing.)';
const CHECKS = {
  tag_valid: 'Each listed citation tag points to a passage that was retrieved for this text.',
  word_overlap: 'Share of the citing sentence\'s words that also occur in the passage. A word check only.',
  support: 'Not verified. No check was made that the passages support the claims.',
};

const L = (o, lang = 'en') => (o && typeof o === 'object' ? (o[lang] || o.en || '') : (o || ''));
const firstWords = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' ');

/**
 * Run one or more queries and merge them: queries take turns, so one action or topic cannot
 * fill every slot. Duplicates are dropped, at most 2 passages per source are kept, and
 * independence is re-marked across the merged list.
 */
function search({ queries, query, context = '', stage = null, k = MAX_PASSAGES, from = 'request', scoped = false, sources = null } = {}) {
  // scoped: true, or one flag per query (generated queries are scoped, a typed question is not)
  const pairs = [];
  (queries || [query]).forEach((q, i) => {
    const text = String(q || '').replace(/\s+/g, ' ').trim();
    if (text && !pairs.some(p => p.text === text)) pairs.push({ text, scoped: Array.isArray(scoped) ? !!scoped[i] : !!scoped });
  });
  const qs = pairs.slice(0, MAX_QUERIES).map(p => p.text);
  const base = { query: qs.join(' · '), queries: qs, context: String(context || '').slice(0, 600), stage, from, build_id: library.buildId(), ...(sources?{source_filter:sources.slice()}: {}) };
  if (!qs.length) return { ...base, status: 'none', passages: [], terms: [], reason: 'nothing to search for' };
  const per = qs.length > 1 ? Math.max(2, Math.ceil(k / qs.length) + 1) : k;
  const runs = qs.map((q, i) => library.retrieve(q, { stage, context: base.context, k: per, scoped: pairs[i].scoped, sources }));
  if (runs.every(r => r.status === 'unavailable')) return { ...base, status: 'unavailable', passages: [], terms: [], reason: runs[0].reason };
  const terms = [...new Set(runs.flatMap(r => r.terms || []))];
  const seen = new Set(), perSource = new Map(), roots = new Map(), passages = [];
  for (let i = 0; passages.length < k && runs.some(r => r.passages[i]); i++) {
    for (const r of runs) {
      const p = r.passages[i];
      if (!p || seen.has(p.id) || passages.length >= k || (perSource.get(p.sourceId) || 0) >= 2) continue;
      seen.add(p.id);
      perSource.set(p.sourceId, (perSource.get(p.sourceId) || 0) + 1);
      const v = { ...p, independent: !roots.has(p.root) };
      delete v.related_to;
      if (v.independent) roots.set(p.root, p.id); else v.related_to = roots.get(p.root);
      passages.push(v);
    }
  }
  if (!passages.length) return { ...base, status: 'none', passages: [], terms, reason: runs.map(r => r.reason).filter(Boolean).join('; ') || 'no passage cleared the relevance threshold' };
  return { ...base, status: 'found', passages, terms, independent_roots: roots.size };
}

/** Evidence for a prompt: delimited, labelled passages, an explicit "none found", or "library not built". */
function promptBlock(r) {
  if (r && r.passages.length) return library.evidenceBlock(r.passages);
  return r && r.status === 'unavailable' ? LIBRARY_UNAVAILABLE : NO_PASSAGE;
}

const tagsIn = text => [...new Set((String(text || '').match(/\[S\d+(?:\s*,\s*S\d+)*\]/g) || []).flatMap(m => m.slice(1, -1).split(/\s*,\s*/)))];

/** Citation record for one retrieved passage; keeps the fields older saved outputs used (id, title, cite, heading). */
function citeOf(p, tag, build) {
  return {
    id: tag, tag, passage_id: p.id, source_id: p.sourceId, title: p.title, url: p.url || null,
    cite: [p.publisher, p.date].filter(Boolean).join(', '),
    heading: [p.locatorLabel, p.heading].filter(Boolean).join(' — '),
    locator: p.locator, locatorLabel: p.locatorLabel, role: p.role, review_status: p.review_status,
    warnings: p.warnings, qualifications: (p.qualifications || []).map(q => q.id), library_build: build,
    qualification_details: p.qualifications || [],
  };
}

/** Which retrieved passages the text cites, tags that match nothing, and the word-overlap signal. */
function citations(text, r) {
  const passages = r?.passages || [];
  const tags = tagsIn(text);
  const at = tag => passages[+tag.slice(1) - 1];
  return {
    sources: tags.filter(at).map(tag => citeOf(at(tag), tag, r.build_id)),
    unknown_tags: tags.filter(tag => !at(tag)),
    word_overlap: library.supportCheck(text, passages).filter(s => s.status !== 'unknown_source')
      .map(s => ({ tag: s.id, passage_id: at(s.id)?.id || null, overlap: s.overlap, status: s.status, sentence: s.sentence.slice(0, 200) })),
  };
}

/** Passages offered next to template text, which cites none of them: no [S#] tag, so nothing looks cited. */
function related(r) {
  return (r?.passages || []).map(p => ({
    title: p.title, heading: [p.locatorLabel, p.heading].filter(Boolean).join(' — '),
    passage_id: p.id, source_id: p.sourceId, locatorLabel: p.locatorLabel, role: p.role,
  }));
}

/**
 * Provenance stored with a generated output: the library build, what was searched, what was
 * retrieved and (for model text) what was cited. Template text records retrieval but cites nothing.
 */
function evidenceRecord(r, cit = null) {
  return {
    library_build: r.build_id || null,
    searched: { query: r.query, queries: r.queries, context: r.context, stage: r.stage, from: r.from, ...(r.source_filter?{source_filter:r.source_filter}:{}), status: r.status, reason: r.reason || null },
    retrieved: r.passages.map(p => ({ passage_id: p.id, source_id: p.sourceId, locator: p.locatorLabel, role: p.role })),
    cited: cit ? cit.sources.map(s => ({ tag: s.tag, passage_id: s.passage_id, source_id: s.source_id, locator: s.locatorLabel })) : [],
    unknown_tags: cit ? cit.unknown_tags : [],
    word_overlap: cit ? cit.word_overlap.map(({ sentence, ...w }) => w) : [],
    checks: CHECKS,
  };
}

// ---------------------------------------------------------------- query builders

/** Utility type and country, used as low-weight context (they never decide relevance on their own). */
function place(f) {
  const p = f?.utility_profile || {};
  const type = { water: 'drinking water supply', ww: 'wastewater sanitation', both: 'water supply and wastewater' }[p.service_type]
    || (f?.ecam_results ? Object.keys(f.ecam_results.by_stage || {}).some(k => k.startsWith('ww')) ? Object.keys(f.ecam_results.by_stage).some(k => k.startsWith('ws')) ? 'water supply and wastewater' : 'wastewater sanitation' : 'drinking water supply' : '');
  return [type, p.country || f?.ecam_results?.country || ''].filter(Boolean).join(' ');
}

/** Queries for one action: its title, plus the start of the user's description for user-proposed actions. */
function actionQueries(a, lang = 'en') {
  const title = L(a.title, lang);
  const out = [title];
  const desc = a.description && typeof a.description === 'string' ? a.description : '';
  if (desc) out.push(firstWords(desc, 14));
  return out.filter(Boolean);
}

/** Explain with AI: the option itself, with its condition and the place as context. */
function forAction(a, f, lang = 'en') {
  return {
    queries: actionQueries(a, lang).slice(0, 2), stage: 2, from: 'action',
    context: [L(a.condition, lang), a.problem || a.problem_addressed || '', place(f)].filter(Boolean).join(' '),
  };
}

/** Plan summary: one query per planned action (up to 3); implementation wording and place as context. */
function forPlan(f) {
  const acts = (f.selected_actions || []).filter(a => a.id !== 'A00').slice(0, 3);
  return {
    queries: acts.length ? acts.map(a => `${a.title} implementation`) : ['project implementation plan'],
    stage: 3, from: 'plan', scoped: true, context: `project implementation plan phases procurement permits ${place(f)}`,
  };
}

const stage3 = n => GUIDE.stage3.find(a => a.n === n);
const s3text = (n, qi) => { const a = stage3(n); return a ? `${a.title} ${qi != null ? a.questions[qi] || '' : a.description || ''}` : ''; };
const s4 = key => (GUIDE.stage4[key] || []).join(' ');
/**
 * What each proposal section is about. terms: short purpose query (kept short so it can match a single
 * passage) · actions: how many selected actions get their own query · framework: team-framework topic,
 * used as context.
 */
const SECTIONS = {
  summary: { terms: 'project summary climate benefit', stage: 4, actions: 2, framework: () => s4('outputs') },
  context: { terms: 'utility service area climate hazards vulnerability', stage: 3, actions: 0, framework: () => s3text(2, 1) },
  rationale: { terms: 'climate rationale baseline climate risks', stage: 3, actions: 0, framework: () => s3text(2, 1) },
  baseline: { terms: 'baseline greenhouse gas emissions energy', stage: 2, actions: 0, framework: () => s3text(2, 0) },
  actions: { terms: '', stage: 2, actions: 3, framework: null },
  impact: { terms: 'emission reduction', stage: 2, actions: 3, framework: null },
  paradigm: { terms: 'replication scaling knowledge enabling environment', stage: 4, actions: 0, framework: null },
  sustainable: { terms: 'co-benefits public health service quality', stage: 3, actions: 0, framework: null },
  needs: { terms: 'vulnerability financing gap capacity', stage: 4, actions: 0, framework: () => s4('funding_gap') },
  ownership: { terms: 'national climate policy alignment country programme', stage: 4, actions: 0, framework: null },
  efficiency: { terms: 'cost effectiveness co-financing', stage: 4, actions: 0, framework: () => s4('cost_components') },
  plan: { terms: 'implementation plan phases procurement', stage: 3, actions: 2, framework: null },
  budget: { terms: 'project cost investment financing', stage: 4, actions: 0, framework: () => `${s4('cost_components')} ${s4('funding_gap')}` },
  risks: { terms: 'climate risks mitigation safeguards', stage: 3, actions: 0, framework: null },
  mrv: { terms: 'monitoring indicators measurement verification', stage: 3, actions: 1, framework: () => s3text(2, 3) },
  logframe: { terms: 'monitoring indicators results framework', stage: 3, actions: 1, framework: () => s3text(2, 3) },
};

/** Team-framework Stage 2 rows that share the most words with the given actions (as context). */
function stage2Topic(acts) {
  const words = new Set(library.tokenize(acts.map(a => `${a.title} ${a.description || ''}`).join(' ')));
  if (!words.size) return '';
  return GUIDE.stage2.map(r => ({ r, n: library.tokenize(`${r.output || r.title || ''} ${(r.actions || []).join(' ')}`).filter(w => words.has(w)).length }))
    .filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 2).map(x => x.r.output || x.r.title).join(' ');
}

/**
 * Proposal section: the section's purpose, relevant actions (only for sections about the actions),
 * the team-framework topic, utility type and country, and the user's question if there is one.
 * A generic heading is never the only query.
 */
function forSection(sec, f, { question = '', lang = 'en' } = {}) {
  const spec = SECTIONS[sec.key] || {
    // a section from an uploaded guide: its own title and the start of its guidance
    terms: firstWords(`${sec.en || sec.title || ''} ${library.tokenize(sec.guidance || '').slice(0, 5).join(' ')}`, 9), stage: 4, actions: 1, framework: null,
  };
  const acts = (f.selected_actions || []).filter(a => a.id !== 'A00');
  const actionQs = acts.slice(0, spec.actions).map(a => L(a.title, lang));
  const typed = question ? firstWords(question, 30) : '';
  const queries = [typed, spec.terms, ...actionQs].filter(Boolean);
  if (!queries.length) queries.push(firstWords(sec.en || sec.title || 'proposal', 8));
  const topic = [spec.framework ? spec.framework() : '', spec.actions ? stage2Topic(acts.slice(0, spec.actions)) : ''].filter(Boolean).join(' ');
  return {
    queries, scoped: queries.map(q => q !== typed), stage: spec.stage, from: question ? 'section+question' : 'section',
    context: [firstWords(sec.guidance || '', 30), topic, place(f), spec.actions ? '' : acts.slice(0, 2).map(a => L(a.title, lang)).join(' ')].filter(Boolean).join(' '),
  };
}

module.exports = {
  search, promptBlock, citations, related, evidenceRecord,
  forAction, forPlan, forSection, actionQueries, place, SECTIONS, CHECKS, NO_PASSAGE, LIBRARY_UNAVAILABLE, MAX_PASSAGES,
};
