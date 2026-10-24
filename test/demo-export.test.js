const fixtureStatus = require('./helpers/fixtures');
/*
 * ECAM-first demo flow, Bahasa Indonesia coverage and Word export formatting.
 * HYPOTHETICAL sample utility and synthetic AI text only; the AI client is injected. Run: npm test
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const JSZip = require('jszip');
const CW = require('../public/js/cw-core');
const CV = require('../public/js/chat-view');
const engine = require('../engine/ecam-engine');
const I = require('../engine/integrity');
const P = require('../engine/proposal');
const PC = require('../engine/plan-concept');
const MD = require('../engine/doc-markdown');
const X = require('../engine/export');
const ai = require('../engine/ai');
const { buildPlan } = require('../engine/plan');
const sample = require('../public/samples/utility-a-indonesia.json');
const { meta, clone } = require('./helpers/fixtures');
const { ensureLibrary } = require('./helpers/synthetic-library');

const UI = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/i18n.js'), 'utf8') + ';UI');
const docXml = async buf => (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
const plain = xml => xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function project(lang = 'en') {
  const assessment = clone(sample[0]);
  const m = meta(assessment, 'a_demo');
  const options = I.optionsFor(assessment, m, 0);
  CW.assignLabels(options, {});
  const selectedActions = options.filter(o => ['pump_upgrade', 'septic_desludging'].includes(o.rule)).map(o => ({ ...o, notes: '' }));
  const plan = { ...buildPlan(selectedActions, lang), summary: 'Synthetic plan summary.', ai: false };
  return { assessment, meta: m, results: engine.calculateOne(assessment, 0), selectedActions, plan };
}

// A synthetic AI section with the problems seen in the reviewed export
const SYNTHETIC = [
  '### B. Climate rationale and context',
  '',
  'The utility reports **81,653 tCO2eq** in *onsite sanitation* (wwo), mostly CH4.',
  '',
  '#### Key drivers',
  '- **Septic tanks:** methane from containment; 2 * 3 is not markup and neither is wsd_vol_dist or #5.',
  '  - nested _detail_ line',
  '- ***Pumps*** at the water distribution stage',
  '',
  '1. Confirm desludging intervals',
  '2. Measure pump duty points',
  '',
  '| Stage | tCO2eq |',
  '|---|---|',
  '| wsd | 1,200 |',
  '',
  '[To be provided: capital cost estimate] [S1]',
].join('\n');

test('bounded Markdown: headings, bold, italics, lists and tables become Word structure; other symbols stay literal', async () => {
  const blocks = MD.parse(SYNTHETIC);
  assert.deepStrictEqual(blocks.map(b => b.type), ['heading', 'para', 'heading', 'bullet', 'bullet', 'bullet', 'number', 'number', 'table', 'para']);
  assert.strictEqual(MD.dropDuplicateTitle(blocks, 'B. Climate rationale and context')[0].type, 'para', 'duplicate opening title removed');
  assert.strictEqual(MD.dropDuplicateTitle(blocks, 'C1. Impact potential')[0].type, 'heading', 'a different heading is kept');
  assert.strictEqual(MD.dropDuplicateTitle(MD.parse('**Project summary**\nText.'), 'Project summary').length, 1, 'bold title line removed');
  assert.deepStrictEqual(MD.inline('a **b** *c* ***d***').map(r => [r.text, !!r.bold, !!r.italic]), [['a ', false, false], ['b', true, false], [' ', false, false], ['c', false, true], [' ', false, false], ['d', true, true]]);
  assert.strictEqual(MD.inline('**unclosed and 2 * 3').map(r => r.text).join(''), '**unclosed and 2 * 3', 'unmatched markers stay literal');
  assert.strictEqual(MD.inline('snake_case_name').map(r => r.text).join(''), 'snake_case_name');

  const p = project();
  const proposal = { title: 'GCF pathway — Utility A', ai: true, sections: [{ key: 'rationale', title: 'B. Climate rationale and context', text: SYNTHETIC, ai: true }] };
  const xml = await docXml(await X.buildProposalDocx({ lang: 'en', proposal, results: p.results, actions: p.selectedActions, plan: p.plan }));
  const text = plain(xml);
  for (const literal of ['###', '####', '**', '***', '*onsite', '_detail_', '|---|']) assert.ok(!text.includes(literal), `no literal ${literal}`);
  assert.strictEqual((text.match(/B\. Climate rationale and context/g) || []).length, 1, 'section title appears once');
  assert.ok(/w:pStyle w:val="Heading2"/.test(xml), 'generated heading becomes a sub-heading of the section');
  assert.ok(/<w:numPr>/.test(xml) && /w:ilvl w:val="1"/.test(xml), 'list numbering and nesting');
  assert.ok((xml.match(/<w:tbl>/g) || []).length >= 2, 'Markdown table and results table are Word tables');
  assert.ok(/<w:tblHeader\/>/.test(xml) && /<w:cantSplit\/>/.test(xml), 'repeated header rows; rows do not split across pages');
  assert.ok(text.includes('2 * 3') && text.includes('wsd_vol_dist') && text.includes('#5'), 'non-markup symbols kept');
  assert.ok(text.includes('CO₂') && text.includes('CH₄') && !/\(wwo\)/.test(text), 'chemical notation; stage code dropped from narrative');
  assert.ok(text.includes('[To be provided: capital cost estimate]') && /w:fill="FFF1CC"/.test(xml), 'placeholder kept and highlighted');
  assert.ok(text.includes('[S1]'), 'citation tag kept');
  assert.ok(/<w:keepNext\/>/.test(xml), 'headings and captions keep with the next paragraph');
  const footer = await (await JSZip.loadAsync(await X.buildProposalDocx({ lang: 'en', proposal, results: p.results }))).file('word/footer1.xml').async('string');
  assert.ok(/PAGE/.test(footer) && /NUMPAGES/.test(footer), 'page numbers in the footer');
});

test('cut-off AI answers are rejected, not accepted as complete text', () => {
  const gem = { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'This assumes the measured' }] } }] };
  assert.throws(() => ai._geminiText(gem), e => e.incomplete === true && e.code === 'PROVIDER');
  assert.throws(() => ai._anthropicText({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'This assumes the measured' }] }), e => e.incomplete === true);
  assert.strictEqual(ai._anthropicText({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] }), 'Done.');
  // saved text from before the check: flagged, never completed
  assert.strictEqual(CW.mayBeIncomplete('Text. This assumes the measured'), true);
  for (const ok of ['A full sentence.', '- list item', 'Ends with a placeholder [To be provided: x]', '| a | b |', 'Question?', 'Ends with a tag [S2]']) assert.strictEqual(CW.mayBeIncomplete(ok), false, ok);
});

test('incomplete saved summary is labelled in the Word file and in the ZIP, without inventing text', async () => {
  const p = project();
  const proposal = { title: 'General proposal — Utility A', ai: false, ai_failed: [{ key: 'summary', title: 'Project summary', error: 'x' }],
    sections: [{ key: 'summary', title: 'Project summary', ai: false, quotes_plan_summary: 'ai', text: 'Utility A will reduce emissions. This assumes the measured\n\n[To be completed: request.]' }] };
  const text = plain(await docXml(await X.buildProposalDocx({ lang: 'en', proposal, results: p.results })));
  assert.ok(text.includes('may be incomplete') || text.includes('May be incomplete'));
  assert.ok(text.includes('This assumes the measured') && !text.includes('This assumes the measured.'), 'text kept as written');
  assert.ok(text.includes('quotes the AI project-plan summary'));
  const zip = await JSZip.loadAsync(await X.buildZip({ lang: 'en', plan: { ...p.plan, ai: true, summary: 'A plan. This assumes the measured' } }, null));
  assert.ok((await zip.file('plan/project-summary.txt').async('string')).includes('May be incomplete'));
});

test('generated plan text is a separate, unverified block in prompts, never DATA', async () => {
  const lib = ensureLibrary();
  const seen = [];
  try {
    ai.setClient(async req => { seen.push(req.messages[0].content); return 'Synthetic section text.'; });
    const p = project();
    const plan = { ...p.plan, ai: true, summary: 'AI summary claiming 999,999 tCO2eq saved.',
      concept: { ai: true, areas: [{ n: 1, title: 'Define the project', status: 'ai', text: 'Concept claiming 777,777 kWh.' }] } };
    const f = P.facts({ results: p.results, actions: p.selectedActions, plan, lang: 'en' });
    assert.deepStrictEqual(Object.keys(f.plan).sort(), ['tasks', 'total_weeks'], 'no generated text in facts');
    const fw = P.financingFrameworks().find(x => x.id === 'general');
    await P.draftProposal({ results: p.results, actions: p.selectedActions, plan, lang: 'en' }, fw);
    const prompt = seen[0];
    const data = prompt.slice(prompt.indexOf('DATA ('), prompt.indexOf('EARLIER DRAFT TEXT'));
    assert.ok(prompt.indexOf('EARLIER DRAFT TEXT') > prompt.indexOf('DATA ('), 'draft block follows DATA');
    assert.ok(!data.includes('999,999') && !data.includes('777,777'), 'AI numbers are not under DATA');
    assert.ok(prompt.slice(prompt.indexOf('EARLIER DRAFT TEXT')).includes('999,999'), 'draft text still available as wording');
    assert.ok(/NOT verified and NOT ECAM data/.test(prompt));
    assert.ok(/"stage": "Water distribution"/.test(data), 'stages are named in DATA');
  } finally { ai.setClient(null); lib.restore(); }
});

test('AI concept areas: unsupported figures, unknown tags and dropped placeholders are recorded', () => {
  const known = PC.numberKeys('{"total_tco2eq":81653.2,"energy_kwh":1200000} [To be provided: x]');
  const c = PC.checkArea('Emissions are 81,653 tCO2eq, saving 45,000 kWh in A02 [S9].', 'Template [To be provided: x]', known, { passages: [] });
  assert.deepStrictEqual(c.unsupported_figures, ['45,000']);
  assert.deepStrictEqual(c.unknown_tags, ['S9']);
  assert.strictEqual(c.placeholders_dropped, true);
  assert.strictEqual(PC.checkArea('Emisi 81.653 tCO2eq [Perlu disediakan: y].', 'T [To be provided: x]', known, { passages: [] }), null, 'Indonesian separators match the same figure');
});

test('export without a utility profile: assessment name is the title fallback; Word and ZIP still build', async () => {
  const p = project();
  const proposal = { title: 'General proposal — ', ai: false, sections: [{ key: 'summary', title: 'Project summary', ai: false, text: 'Text.' }] };
  const text = plain(await docXml(await X.buildProposalDocx({ lang: 'en', proposal, results: p.results, actions: p.selectedActions, plan: p.plan, profile: null })));
  assert.ok(text.includes(`General proposal — ${p.results.name}`), 'title uses the assessment name');
  const zip = await JSZip.loadAsync(await X.buildZip({ lang: 'en', assessments: [p.assessment], results: [p.results], selectedActions: p.selectedActions, plan: p.plan }, null));
  assert.ok(!zip.file('utility-profile.json'), 'no profile file is invented');
  const f = P.facts({ results: p.results, actions: p.selectedActions, plan: p.plan, lang: 'en' });
  assert.strictEqual(f.ecam_results.assessment, p.results.name);
  assert.ok(!f.utility_profile?.capex && !f.utility_profile?.resp_water_supply, 'responsibility and capacity stay unspecified');
});

test('Indonesian export: labels, numbers, dates, README and concept statuses are in Bahasa Indonesia; machine keys stay', async () => {
  const p = project('id');
  const fw = P.financingFrameworks().find(x => x.id === 'gcf');
  const proposal = await P.draftProposal({ results: p.results, actions: p.selectedActions, plan: p.plan, lang: 'id' }, fw);
  assert.ok(proposal.sections.every(s => !/[A-Za-z]+ (and|the|with) /.test(s.guidance)), 'section guidance in Indonesian');
  const text = plain(await docXml(await X.buildProposalDocx({ lang: 'id', proposal, results: p.results, actions: p.selectedActions, plan: p.plan })));
  for (const w of ['Status draf', 'Hasil dasar ECAM', 'Kegiatan terpilih', 'Periode penilaian', 'Disiapkan']) assert.ok(text.includes(w), w);
  for (const w of ['Expected result', 'Draft status', 'Selected actions', 'Assessment period']) assert.ok(!text.includes(w), `no English label ${w}`);
  assert.ok(/\d{1,3}(\.\d{3})+/.test(text), 'Indonesian thousands separator');
  assert.ok(text.includes('bahasa aslinya'), 'original-language note for sources');
  const footer = await (await JSZip.loadAsync(await X.buildProposalDocx({ lang: 'id', proposal, results: p.results }))).file('word/footer1.xml').async('string');
  assert.ok(footer.includes('Halaman') && footer.includes('dari'));
  const concept = { areas: PC.template({ facts: P.facts({ results: p.results, actions: p.selectedActions, plan: p.plan, lang: 'id' }), actions: p.selectedActions, plan: p.plan, lang: 'id' }), ai: false, ai_failed: true };
  assert.ok(concept.areas[1].questions[0].startsWith('Berapa'), 'framework questions in Indonesian');
  const zip = await JSZip.loadAsync(await X.buildZip({ lang: 'id', assessments: [p.assessment], results: [p.results], selectedActions: p.selectedActions, plan: { ...p.plan, concept } }, null));
  const readme = await zip.file('README.txt').async('string');
  assert.ok(readme.startsWith('Ekspor ChatWater Resilience') && readme.includes('kunci mesin'));
  assert.ok(!/Silvia|ditinjau Silvia/.test(readme), 'review annotations stay out of participant files');
  const md = await zip.file('plan/project-concept.md').async('string');
  assert.ok(md.includes(UI.id.pc_status_template) && md.includes('AI tidak dapat menyusun konsep proyek'));
  const csv = await zip.file('plan/project-plan.csv').async('string');
  assert.ok(csv.startsWith('id,action,task,owner,start_week,weeks,depends_on,action_origin'), 'CSV headers are stable keys');
});

test('interface strings: every key exists in both languages; chat context translates from codes', () => {
  assert.deepStrictEqual(Object.keys(UI.en).filter(k => !(k in UI.id)), []);
  assert.deepStrictEqual(Object.keys(UI.id).filter(k => !(k in UI.en)), []);
  const ctx = { t: k => UI.id[k] ?? UI.en[k] ?? k, esc: s => String(s ?? ''), fmt: n => String(n), lang: 'id', stageLabel: p => ({ wsd: 'Distribusi air minum' })[p] || p };
  const html = CV.contextPanel({
    assessment: { id: 'a', name: 'Utility A', period: { start: '2024-01-01', end: '2024-12-31' } },
    focus: { kind: 'result', label: 'wsd › Zone 1', prefix: 'wsd', sid: 's3', name: 'Zone 1' },
    problems: ['The project plan was made for a different assessment; it is not used here.'], problem_codes: [{ code: 'plan_other' }],
    freshness: { actions: { status: 'outdated', codes: ['assessment_changed'], reasons: ['the assessment data changed'] }, plan: { status: 'none for this assessment' }, proposal: { status: 'none saved' } },
    framework: { review_status: 'draft', stage3: [{ area: 1, title: 'Define the project', description: 'Purpose', questions: [] }] },
  }, ctx, true);
  assert.ok(html.includes('Distribusi air minum › Zone 1'));
  assert.ok(html.includes(UI.id.chat_problem_plan_other) && !html.includes('was made for a different assessment'));
  assert.ok(html.includes(UI.id.stale_assessment_changed) && html.includes(UI.id.chat_status_none_here));
  assert.ok(!html.includes(UI.id.chat_fw_original_language), 'translated framework text carries no original-language note');
  const en = CV.contextPanel({ assessment: null, focus: { kind: 'general' }, framework: { review_status: 'draft', stage2: [{ id: 'x', title: 'Row', questions: ['Q?'], actions: [], original_language: 'en' }] } }, ctx, true);
  assert.ok(en.includes(UI.id.chat_fw_original_language) && en.includes(UI.id.original_english), 'untranslated rows are marked as English originals');
});

test('chat context: responsibility, rejected actions, ECAM estimates, concept status and selected pathways stay distinct', () => {
  const C = require('../engine/chat-context');
  const p = project();
  p.assessment.Water.Distribution[0].Configuration.Questions.wsd_water_eff=true; // this test deliberately evaluates and rejects the water-loss option
  const wsd = p.meta.substages.wsd[0];
  const nrw = I.optionsFor(p.assessment, p.meta, 0).find(o => o.rule === 'nrw_reduction');
  const vol = p.assessment.Water.Distribution[0].wsd_vol_dist;
  const concept = { areas: PC.template({ facts: P.facts({ results: p.results, actions: p.selectedActions, plan: p.plan, lang: 'en' }), actions: p.selectedActions, plan: p.plan, lang: 'en' }), ai: false };
  for (const lang of ['en', 'id']) {
    const { context: c, text } = C.build({inputStatus:fixtureStatus.confirmedInputs(p.assessment,p.meta),
      lang, view: 'plan', assessment: p.assessment, meta: p.meta, question: 'What is our largest emission source?',
      profile: { resp_onsite: 'none', resp_water_supply: 'operates' },
      rejectedActions: { [nrw.key]: { reason: 'synthetic: programme already funded', at: 'now' } },
      estimateUse: { [wsd]: { wsd_vol_dist: vol } },
      plan: { ...p.plan, concept, deps: { assessmentId: 'a_demo' } },
      financing: { pathways: ['national_transfer'] },
    });
    // largest source in the inventory is reported with its recorded responsibility, not dropped
    const top = c.results.largest_contributor[0];
    assert.strictEqual(top.source, 'containment');
    assert.strictEqual(top.responsibility, 'outside');
    assert.strictEqual(c.responsibility.largest_source_in_inventory.component, 'containment');
    assert.strictEqual(c.responsibility.areas.onsite_containment, 'none');
    assert.match(c.responsibility.areas.sewer_collection, /unknown/);
    assert.ok(c.responsibility.largest_source_the_utility_operates && c.responsibility.largest_source_the_utility_operates.responsibility === 'direct');
    assert.deepStrictEqual(c.actions.rejected.map(x => [x.label, x.reason, x.in_saved_selection]), [[nrw.id, 'synthetic: programme already funded', false]]);
    assert.deepStrictEqual(c.inputs.ecam_estimates.map(x => x.code), ['wsd_vol_dist']);
    assert.ok(c.concept.kind.startsWith('unverified narrative') && c.concept.areas.length === 8);
    const dak = c.pathways[0].documents.find(d => d.id === 'id-dak-air-minum-excerpt');
    assert.ok(/unidentified parent document/.test(dak.review_status) && /not proofread/.test(dak.review_status));
    assert.strictEqual(dak.caveats.length, 2);
    for (const head of ['RESPONSIBILITY (', 'REJECTED ACTIONS', 'INPUT PROVENANCE', 'PROJECT CONCEPT — unverified narrative', 'SELECTED FINANCING PATHWAYS']) assert.ok(text.includes(head), head);
    assert.ok(text.length <= C.TEXT_LIMIT && !text.includes('left out at the size limit'), 'every section fits');
    // the panel shows the same items in the interface language
    const ctx = { t: k => UI[lang][k] ?? k, esc: s => String(s ?? ''), fmt: n => String(n), lang };
    const html = CV.contextPanel(c, ctx, true);
    assert.ok(html.includes('data-largest-resp="outside"') && html.includes(UI[lang].tier_outside));
    assert.ok(html.includes(`data-ctx-rejected="${nrw.key}"`) && html.includes('data-ctx-estimate="wsd_vol_dist"') && html.includes('data-ctx-doc="id-dak-air-minum-excerpt"'));
    if (lang === 'id') assert.ok(html.includes('Dokumen induk, tahun, dan status hukumnya tidak diketahui') && html.includes('belum diperiksa ulang'));
  }
  // an unanswered profile keeps the largest source and marks its responsibility unknown
  const { context: u } = C.build({inputStatus:fixtureStatus.confirmedInputs(p.assessment,p.meta), lang: 'en', view: 'assess', assessment: p.assessment, meta: p.meta });
  assert.strictEqual(u.results.largest_contributor[0].responsibility, 'unspecified');
  assert.ok(u.results.largest_contributor[0].responsibility_note);
});

test('Indonesian: framework rows, alternatives, source notes, GWP and unit words', () => {
  const C = require('../engine/chat-context');
  const ALT = require('../engine/alternatives');
  const SN = require('../public/js/source-notes');
  const GUIDE = require('../frameworks/stage-guidance.json');
  for (const r of GUIDE.stage2) {
    const [row] = C.frameworkRows({ rule: null, prefix: r.links?.stages?.[0], source: r.links?.source }, 99, 'id').filter(x => x.id === r.id);
    if (row) assert.ok(!row.original_language && row.questions.length === r.questions.length, r.id);
  }
  const alt = ALT.fromFramework({ rule: 'pump_upgrade', key: 'a|pump_upgrade|wsa_0' }, 'id');
  assert.ok(alt.items.length && !alt.original_language && alt.items[0].title === 'Audit efisiensi pompa');
  // every curated review status and caveat has an Indonesian wording
  const curated = require('../scripts/library/sources.json');
  const list = Object.values(curated.sources).filter(x => x && x.id);
  const notes = list.flatMap(s => [s.review_status, ...[].concat(s.caveats || [])]).filter(Boolean);
  assert.deepStrictEqual(notes.filter(n => SN.localize(n, 'id').original), []);
  assert.strictEqual(SN.locator({ page: 4, printed_page: 696 }, 'id'), 'hlm. 4 (hlm. cetak 696)');
  assert.strictEqual(CW.gwpLabel('IPCC 4th AR (2007)', 'id'), 'Laporan Penilaian Keempat IPCC (IPCC 4th AR (2007))');
  assert.strictEqual(CW.gwpLabel('unknown report', 'id'), 'unknown report');
  assert.strictEqual(CW.unitLabel('kg/person/year', 'id'), 'kg/orang/tahun');
  assert.strictEqual(CW.unitLabel('kWh/m3', 'id'), 'kWh/m3');
  // exported source lines keep every qualifier
  const line = X.sourceLine({ id: 'S1', title: 'T', cite: 'Not stated in the excerpt', heading: 'p. 3', locator: { page: 3 }, locatorLabel: 'p. 3',
    review_status: list.find(s => s.id === 'id-dak-air-minum-excerpt').review_status, warnings: list.find(s => s.id === 'id-dak-air-minum-excerpt').caveats }, 'id');
  assert.ok(line.includes('hlm. 3') && line.includes('Catatan sumber') && line.includes('belum diperiksa ulang') && line.includes('jangan dikutip sebagai aturan yang berlaku'), line);
});

test('shared formatter: locale separators for display, calendar dates do not shift', () => {
  assert.strictEqual(CW.formatNumber(81653.24, 'en', 1), '81,653.2');
  assert.strictEqual(CW.formatNumber(81653.24, 'id', 1), '81.653,2');
  assert.strictEqual(CW.formatNumber(null, 'id'), '–');
  assert.ok(CW.formatDate('2024-12-31', 'id').includes('2024') && CW.formatDate('2024-12-31', 'id').includes('31'));
  assert.ok(CW.formatDate('2024-01-01', 'en').includes('2024') && !CW.formatDate('2024-01-01', 'en').includes('2023'));
});

(async () => {
  console.log('Demo flow, language and export');
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log('  ok -', name); } catch (e) { console.error('  FAIL -', name); console.error(e); process.exit(1); }
  }
  console.log(`\n${passed} demo/export tests passed`);
})();
