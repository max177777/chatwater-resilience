#!/usr/bin/env node
/*
 * Runs the fresh library evaluation set (test/eval/library-eval.json) through the same
 * query builders the app uses, and prints hit@1 / hit@5 per item.
 *
 *   node scripts/library/eval.js                 print results
 *   node scripts/library/eval.js --record LABEL  also append the run to test/eval/library-eval-runs.json
 *
 * Internal evaluation only: the questions and expected sources were written by the developer.
 * Only the first recorded run preceded tuning; later runs are recorded as development results.
 * Needs the built library (knowledge/library/, git-ignored); without it the script exits with code 2
 * and reports the missing prerequisite instead of a score.
 */
const fs = require('fs');
const path = require('path');
const R = require('../../engine/retrieval');
const P = require('../../engine/proposal');
const engine = require('../../engine/ecam-engine');
const { suggestActions } = require('../../engine/actions');

const ROOT = path.join(__dirname, '..', '..');
const SET = path.join(ROOT, 'test', 'eval', 'library-eval.json');
const RUNS = path.join(ROOT, 'test', 'eval', 'library-eval-runs.json');
const TRAINING_WARNING = /Training material/;

function utilityA() {
  const assessment = require(path.join(ROOT, 'public', 'samples', 'utility-a-indonesia.json'))[0];
  const results = engine.calculateOne(assessment, 0);
  const { options } = suggestActions(results, assessment, engine, 0);
  return { results, options };
}

function requestFor(item, ua) {
  const lang = item.lang || 'en';
  const inp = item.input;
  if (inp.query) return { query: inp.query, stage: item.stage || null, from: 'eval' };
  if (inp.custom) {
    const f = P.facts({ results: ua.results, actions: [], lang });
    return R.forAction({ ...inp.custom }, f, lang);
  }
  if (inp.section) {
    const fw = P.financingFrameworks().find(x => x.id === inp.section.framework);
    const sec = fw.sections.find(s => s.key === inp.section.key);
    const actions = (inp.actions || []).map(rule => ua.options.find(o => o.rule === rule)).filter(Boolean);
    const f = P.facts({ results: ua.results, actions, lang });
    return R.forSection(sec, f, { lang, question: inp.question || '' });
  }
  throw new Error(`item ${item.id}: no input`);
}

function judge(item, r, e = item.expect) {
  if (e.status === 'none') return { pass: r.status === 'none', rank: null };
  if (r.status !== 'found') return { pass: false, rank: null };
  const re = e.text_re ? new RegExp(e.text_re, 'i') : null;
  const rel = p => (e.sources_any || []).includes(p.sourceId) && (!re || re.test(`${p.heading} ${p.text}`));
  const idx = r.passages.findIndex(rel);
  let pass = idx >= 0;
  const notes = [];
  if (e.qualified && !r.passages.some(p => p.qualifications?.length)) { pass = false; notes.push('no qualified passage'); }
  if (e.training_warned) {
    const tr = r.passages.filter(p => p.role === 'training_example');
    if (tr.some(p => !p.warnings.some(w => TRAINING_WARNING.test(w)))) { pass = false; notes.push('training passage without warning'); }
    notes.push(`${tr.length} training passage(s), all warned`);
  }
  return { pass, rank: idx >= 0 ? idx + 1 : null, notes };
}

/** Without a built library there is nothing to evaluate; scoring empty results would look like a real result. */
function prerequisite() {
  const s = require('../../engine/library').summary();
  if (s.loaded && s.passages) return null;
  return `document library not built (${s.error || 'no indexed passages'}). Build it first: node scripts/library/build.js --input-dir <folder with the supplied files>`;
}

function run() {
  const missing = prerequisite();
  if (missing) { const e = new Error(`Prerequisite missing: ${missing}`); e.code = 'LIBRARY_NOT_BUILT'; throw e; }
  const set = JSON.parse(fs.readFileSync(SET, 'utf8'));
  const ua = utilityA();
  const rows = set.items.map(item => {
    const req = requestFor(item, ua);
    const r = R.search(req);
    const j = judge(item, r);
    // a corrected annotation is also scored as originally written, so the correction stays visible
    const original = item.expect_original ? { pass_original_annotation: judge(item, r, item.expect_original).pass } : {};
    return { id: item.id, kind: item.kind, lang: item.lang, expect: item.expect.status, status: r.status, ...j, ...original,
      query: r.query, top: r.passages.slice(0, 5).map(p => p.id) };
  });
  const found = rows.filter(x => x.expect === 'found'), none = rows.filter(x => x.expect === 'none');
  const byKind = {};
  for (const x of rows) { const k = byKind[x.kind] || (byKind[x.kind] = { pass: 0, n: 0 }); k.n++; if (x.pass) k.pass++; }
  const metrics = {
    items: rows.length, en: rows.filter(x => x.lang === 'en').length, id: rows.filter(x => x.lang === 'id').length,
    hit_at_1: found.filter(x => x.rank === 1).length, hit_at_5: found.filter(x => x.pass).length, supported: found.length,
    mrr: +(found.reduce((a, x) => a + (x.rank && x.pass ? 1 / x.rank : 0), 0) / (found.length || 1)).toFixed(2),
    none_correct: none.filter(x => x.pass).length, none_total: none.length, by_kind: byKind,
    annotation_version: set.annotation_version || 1,
    corrected_items: rows.filter(x => 'pass_original_annotation' in x).map(x => ({ id: x.id, pass: x.pass, pass_original_annotation: x.pass_original_annotation })),
  };
  return { rows, metrics };
}

if (require.main === module) {
  const missing = prerequisite();
  if (missing) { console.error(`NOT RUN — prerequisite missing: ${missing}\nNo evaluation result was produced.`); process.exit(2); }
  const { rows, metrics } = run();
  for (const x of rows) console.log(`${x.pass ? 'pass' : 'FAIL'}  ${x.id.padEnd(30)} ${x.expect === 'none' ? `status ${x.status}` : `rank ${x.rank ?? '-'}`}${x.notes?.length ? '  (' + x.notes.join('; ') + ')' : ''}${x.pass ? '' : `\n        searched: ${x.query}\n        top: ${x.top.join(', ')}`}`);
  console.log(`supported: hit@1 ${metrics.hit_at_1}/${metrics.supported}, hit@5 ${metrics.hit_at_5}/${metrics.supported}, MRR ${metrics.mrr} · "no passage" correct ${metrics.none_correct}/${metrics.none_total}`);
  console.log('by kind:', Object.entries(metrics.by_kind).map(([k, v]) => `${k} ${v.pass}/${v.n}`).join(', '));
  for (const c of metrics.corrected_items) console.log(`annotation corrected: ${c.id} ${c.pass ? 'passes' : 'fails'} (original annotation: ${c.pass_original_annotation ? 'pass' : 'fail'})`);
  const i = process.argv.indexOf('--record');
  if (i > 0) {
    const label = process.argv[i + 1] || 'unlabelled';
    const runs = fs.existsSync(RUNS) ? JSON.parse(fs.readFileSync(RUNS, 'utf8')) : { note: 'Runs of test/eval/library-eval.json. Internal evaluation, not practitioner validation.', runs: [] };
    // only the first run preceded tuning on this set; every later run is a development result
    const role = runs.runs.length ? 'development' : 'before tuning';
    runs.runs.push({ label, role, at: new Date().toISOString(), library_build: require('../../engine/library').buildId(), metrics, rows: rows.map(({ query, top, ...x }) => ({ ...x, query, top })) });
    fs.writeFileSync(RUNS, JSON.stringify(runs, null, 1) + '\n');
    console.log(`recorded run "${label}" in ${path.relative(ROOT, RUNS)}`);
  }
}

module.exports = { run, prerequisite };
