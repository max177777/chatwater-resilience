/*
 * Meeting feedback (Oct 20): responsibility tiers, actionable emissions, alternatives,
 * plan concept, financing pathways and the review checklist. Offline. Run: npm test
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const engine = require('../engine/ecam-engine');
const { suggestActions } = require('../engine/actions');
const AS = require('../public/js/action-sources');
const RS = require('../public/js/responsibility');
const FU = require('../public/js/feedback-ui');
const CW = require('../public/js/cw-core');
const PW = require('../engine/pathways');
const PC = require('../engine/plan-concept');
const ALT = require('../engine/alternatives');
const P = require('../engine/proposal');
const { buildPlan } = require('../engine/plan');
const sample = require('../public/samples/utility-a-indonesia.json')[0];
const profile = require('../public/samples/utility-a-profile.json');
const { ensureLibrary } = require('./helpers/synthetic-library');

const UI = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/i18n.js'), 'utf8') + ';UI');
const ctx = lang => ({ t: k => UI[lang][k] ?? UI.en[k] ?? k, L: o => (o && typeof o === 'object' ? o[lang] || o.en : o), esc: s => String(s ?? ''), fmt: n => String(Math.round(n)), stageLabel: p => p, componentText: (p, c) => `${p}_${c}` });

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok -', name); };

(async () => {
  console.log('Meeting feedback');
  const lib = ensureLibrary();
  try {
    const results = engine.calculateOne(sample);
    const meta = { id: 'a1', substages: { wsa: ['s1'], wst: ['s2'], wsd: ['s3'], wwc: ['s4'], wwt: ['s5'], wwo: ['s6'] } };
    const options = CW.withKeys(suggestActions(results, sample, engine, 0).options, meta);
    const byRule = r => options.find(o => o.rule === r);

    ok('every new interface string exists in English and Bahasa Indonesia', () => {
      const keys = Object.keys(UI.en).filter(k => /^(resp_|area_|role_|cap|tech_capacity|data_availability|tier_|rb_|fl_|ra_|act_|alt_|est_|pc_|rv_|fp|cat_|results_details)/.test(k));
      assert.ok(keys.length > 80);
      assert.deepStrictEqual(keys.filter(k => !(k in UI.id)), []);
    });

    ok('emission sources map to service areas; septic containment is household, desludging is a service', () => {
      assert.strictEqual(RS.areaOfComponent('wsa', 'elec'), 'water_supply');
      assert.strictEqual(RS.areaOfComponent('wwo', 'containment'), 'onsite_containment');
      assert.strictEqual(RS.areaOfComponent('wwo', 'tre'), 'fs_services');
      assert.strictEqual(RS.forOption(byRule('septic_desludging'), profile).area, 'fs_services');
      assert.strictEqual(RS.forOption(byRule('pump_upgrade'), profile).area, 'water_supply');
    });

    ok('inventory split: totals unchanged, septic tanks outside, largest actionable source differs from largest overall', () => {
      const { rows } = AS.rowsFromResults(results, meta);
      const b = RS.breakdown(rows, profile);
      assert.ok(Math.abs(b.total - results.totals.total) < 1e-6, 'split adds up to the ECAM total');
      const sum = Object.values(b.byTier).reduce((a, v) => a + v, 0);
      assert.ok(Math.abs(sum - b.total) < 1e-6);
      assert.ok(Math.abs(b.byTier.outside - results.substages.find(s => s.prefix === 'wwo').outputs.wwo_KPI_GHG_containment.total) < 1e-6);
      assert.strictEqual(b.top.overall.component, 'containment');
      assert.strictEqual(b.top.overall.tier, 'outside');
      assert.ok(['direct', 'conditional'].includes(b.top.actionable.tier));
      assert.notStrictEqual(b.top.actionable.component, 'containment');
    });

    ok('without answers everything is "not specified" and the panel asks for the profile', () => {
      assert.strictEqual(RS.forOption(byRule('pump_upgrade'), {}).tier, 'unspecified');
      assert.ok(FU.responsibilityPanel([], {}, ctx('en')).includes('data-ra="unset"'));
    });

    ok('tiers follow the answers; utility-wide work follows the services the utility runs', () => {
      const p = { ...profile, resp_fs: 'none' };
      assert.strictEqual(RS.forOption(byRule('septic_desludging'), p).tier, 'outside');
      assert.strictEqual(RS.forOption(byRule('septic_desludging'), profile).tier, 'conditional');
      assert.strictEqual(RS.forOption(byRule('solar_pv'), profile).tier, 'direct');
      assert.strictEqual(RS.forOption(byRule('solar_pv'), { resp_water_supply: 'none', resp_sewer: 'none', resp_wwtp: 'none', resp_onsite: 'none', resp_fs: 'none' }).tier, 'outside');
      assert.strictEqual(RS.groupOf(byRule('solar_pv'), profile, { [byRule('solar_pv').key]: { reason: 'x' } }), 'rejected');
    });

    ok('capacity answers add flags but never hide options or change figures', () => {
      const p = { ...profile, capex: 'external', tech_capacity: 'limited', data_availability: 'limited' };
      const f = RS.flags(byRule('pump_upgrade'), p);
      assert.deepStrictEqual(f.sort(), ['data_mostly_estimated', 'needs_external_finance', 'needs_technical_support']);
      assert.deepStrictEqual(RS.flags(byRule('pump_audit'), { capex: 'external' }), []);
      const before = JSON.stringify(options);
      options.forEach(o => { RS.forOption(o, p); RS.flags(o, p); });
      assert.strictEqual(JSON.stringify(options), before);
    });

    ok('framework alternatives come from the team framework rows for the option (AI off)', () => {
      const a = ALT.fromFramework(byRule('pump_upgrade'), 'en');
      assert.ok(a.items.length >= 3 && a.items.every(i => i.title && i.framework_row));
      assert.ok(a.items.some(i => /variable-speed/i.test(i.title)));
      assert.ok(a.items.every(i => !FU.hasFigures(i.title)));
      assert.ok(FU.hasFigures('Saves 1,200 kWh per month') && FU.hasFigures('Biaya Rp 50 juta') && !FU.hasFigures('Install 2 drives'));
    });

    ok('financing pathways: reasons are shown, eligibility is never stated, chosen ones reach the facts', () => {
      const sel = [byRule('pump_upgrade'), byRule('septic_desludging')];
      const m = PW.match({ actions: sel, profile, lang: 'en' });
      assert.ok(m.matched.length >= 2);
      assert.ok(m.matched.every(p => p.reasons.length > 0));
      const lg = m.matched.find(p => p.id === 'local_government');
      assert.ok(lg && lg.reasons.some(r => /coordination/.test(r)), 'desludging is shared with local government');
      const facts = PW.forFacts(['climate_fund'], 'id');
      assert.strictEqual(facts[0].status, 'pathway to investigate; eligibility not confirmed');
      assert.ok(/Dana iklim/.test(facts[0].name));
      const audit = PW.match({ actions: [byRule('pump_audit')], profile: { capex: 'own' } });
      assert.ok(audit.matched.some(p => p.id === 'utility_budget') && !audit.matched.some(p => p.id === 'climate_fund'), 'a low-cost audit is not sent to climate funds');
    });

    ok('choosing pathways marks an existing proposal outdated; none chosen keeps older keys', () => {
      assert.strictEqual(CW.frameworkKey({ route: 'general' }), 'general');
      assert.strictEqual(CW.frameworkKey({ route: 'general', pathways: [] }), 'general');
      assert.notStrictEqual(CW.frameworkKey({ route: 'general', pathways: ['ppp'] }), 'general');
      assert.strictEqual(CW.frameworkKey({ route: 'gcf', pathways: ['a', 'b'] }), CW.frameworkKey({ route: 'gcf', pathways: ['b', 'a'] }));
    });

    const actions = [byRule('septic_desludging'), byRule('pump_upgrade')];
    const plan = buildPlan(actions, 'en');
    ok('plan concept: eight framework areas, data where known, placeholders where not, no summed savings', () => {
      const f = P.facts({ results, actions, plan, profile, meta, lang: 'en' });
      const b = RS.breakdown(AS.rowsFromResults(results, meta).rows, profile);
      const areas = PC.template({ facts: f, actions, plan, profile, breakdown: b, estimates: 2, lang: 'en' });
      assert.strictEqual(areas.length, 8);
      assert.ok(areas[1].text.includes('81,653') && /outside its responsibility/.test(areas[1].text));
      assert.ok(/2 input\(s\) use ECAM estimates/.test(areas[1].text));
      assert.ok(areas.every(a => /\[To be provided:/.test(a.text)), 'each area shows what is still missing');
      assert.ok(/Coordination needed for A\d+/.test(areas[3].text));
      assert.ok(!/add up to about/i.test(areas.map(a => a.text).join(' ')));
      const id = PC.template({ facts: P.facts({ results, actions, plan, profile, meta, lang: 'id' }), actions, plan, profile, breakdown: b, lang: 'id' });
      assert.ok(/Perlu disediakan/.test(id[0].text) && id[0].title === 'Menetapkan proyek');
    });

    ok('concept edits change the plan fingerprint; plans without a concept keep theirs', () => {
      const base = { summary: 's', total_weeks: 1, tasks: [] };
      const a = CW.planFingerprint(base);
      assert.strictEqual(a, CW.planFingerprint({ ...base, concept: undefined }));
      const withC = { ...base, concept: { areas: [{ text: 'x' }] } };
      assert.notStrictEqual(CW.planFingerprint(withC), CW.planFingerprint({ ...base, concept: { areas: [{ text: 'y' }] } }));
    });

    ok('review checklist counts placeholders, unreviewed AI text and uncited claims', () => {
      const r = FU.review([
        { where: 'A', text: 'Done. [To be provided: cost] and [Perlu disediakan: izin]', ai: false },
        { where: 'B', text: 'The utility can apply for a GCF grant. Eligible under the regulation [S1].', ai: true, reviewed: false },
        { where: 'C', text: 'All fine.', ai: true, reviewed: true },
      ]);
      assert.deepStrictEqual([r.placeholders, r.unreviewed, r.uncited], [2, 1, 1]);
      assert.ok(FU.reviewChecklist([{ where: 'x', text: 'ok', ai: false }], ctx('en')).includes('data-review-ok'));
    });

    ok('drafting facts carry responsibilities, chosen pathways and estimate count', () => {
      const f = P.facts({ results, actions, plan, profile, meta, lang: 'en', pathways: PW.forFacts(['local_government']), estimates: 3 });
      assert.strictEqual(f.utility_responsibility.actions.find(a => a.id === actions[0].id).responsibility, 'conditional');
      assert.ok(f.utility_responsibility.inventory_tco2eq.outside_utility_responsibility > 70000);
      assert.strictEqual(f.financing_pathways_to_investigate.length, 1);
      assert.strictEqual(f.inputs_based_on_ecam_estimates, 3);
    });

    // API routes
    const app = require('../server');
    const server = app.listen(0);
    const post = (p, body) => fetch(`http://localhost:${server.address().port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const alt = await (await post('/api/actions/alternatives', { option: byRule('pump_upgrade'), assessment: sample, meta, profile, lang: 'en' })).json();
      assert.strictEqual(alt.source, 'framework'); assert.strictEqual(alt.ai, false); assert.ok(alt.items.length);
      const rev = await post('/api/actions/alternatives', { option: byRule('pump_upgrade'), assessment: sample, meta, profile, mode: 'revise', request: 'cheaper', lang: 'en' });
      assert.strictEqual(rev.status, 503, 'revise needs AI');
      const pw = await (await post('/api/pathways', { actions, profile, lang: 'id' })).json();
      assert.ok(pw.matched.length && /Jalur|Anggaran|Dana|Pinjaman|Kerja sama|Transfer/.test(pw.matched.map(p => p.name.id).join(' ')));
      n++; console.log('  ok - API: alternatives (framework without AI, revise needs AI) and pathways');

      // with a fake model: alternatives and the concept come back as AI drafts without figures in the data model
      const ai = require('../engine/ai');
      ai.setClient(async ({ messages }) => {
        const text = messages[0].content;
        if (/"areas"/.test(text)) return JSON.stringify({ areas: [{ n: 1, text: 'AI area one [To be provided: objective]' }] });
        return JSON.stringify({ items: [{ title: 'Drives first', description: 'Fit drives', problem: 'p', why: 'cheap', open: 'check motors' }] });
      });
      const ra = await (await post('/api/actions/alternatives', { option: byRule('pump_upgrade'), assessment: sample, meta, profile, mode: 'revise', request: 'cheaper', lang: 'en' })).json();
      assert.strictEqual(ra.source, 'ai'); assert.strictEqual(ra.items.length, 1); assert.strictEqual(ra.items[0].title, 'Drives first');
      const actionSet = { assessmentId: meta.id, revision: CW.revision(sample), gwpIndex: 0 };
      const pl = await (await post('/api/plan', { actions, actionSet, assessment: sample, meta, profile, lang: 'en', estimates: 1 })).json();
      assert.strictEqual(pl.concept.areas.length, 8);
      assert.strictEqual(pl.concept.areas[0].status, 'ai'); assert.strictEqual(pl.concept.areas[1].status !== 'ai', true, 'areas the model skipped keep the data-based text');
      ai.setClient(null);
      n++; console.log('  ok - API with a fake model: revised action and AI concept, data-based fallback per area');
    } finally { server.close(); }
    console.log(`\n${n} feedback tests passed`);
  } finally { lib.restore(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
