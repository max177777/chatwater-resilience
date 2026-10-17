/*
 * Stage 3/4 drafting: compact "facts" for prompts, AI drafting with a
 * deterministic fallback when AI is not configured.
 */
const fs = require('fs');
const path = require('path');
const { callClaude, aiEnabled } = require('./ai');
const { expectedText } = require('./export');
const knowledge = require('./knowledge');

// Topics each kind of draft prefers when retrieving (first folder under /knowledge)
const PLAN_TOPICS = ['plan', 'indonesia', 'general'];
const FINANCE_TOPICS = ['financing', 'indonesia', 'general'];

/** Retrieve passages for a draft: section/plan wording + selected actions + place. */
function retrieve(f, extra, topics, k = 6) { // topics are a hard filter: no off-topic citations
  const acts = (f.selected_actions || []).filter(a => a.id !== 'A00').map(a => a.title).join(' ');
  const place = [f.utility_profile?.location, f.utility_profile?.country || f.ecam_results?.country].filter(Boolean).join(' ');
  return knowledge.asSources(knowledge.search(`${extra} ${acts} ${place}`, { k, topics, only: topics, excludeEcam: true }));
}

const FW_DIR = path.join(__dirname, '..', 'frameworks');
const prompt = name => fs.readFileSync(path.join(FW_DIR, 'prompts', name + '.md'), 'utf8');
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
const LANG_NAME = { en: 'English', id: 'Bahasa Indonesia' };
const fmt = (n, d = 0) => (n == null || !Number.isFinite(n)) ? '–'
  : n.toLocaleString('en-US', { maximumFractionDigits: d });

function financingFrameworks() {
  return fs.readdirSync(path.join(FW_DIR, 'financing')).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(FW_DIR, 'financing', f), 'utf8')));
}

/** Compact, number-safe summary of the results for prompts. */
function facts({ results, actions, plan, profile, lang = 'en' }) {
  const L = o => (o && typeof o === 'object') ? (o[lang] || o.en) : o;
  const r = results;
  return {
    utility_profile: profile || null,
    ecam_results: r ? {
      assessment: r.name, country: r.country, period: r.period, gwp_report: r.gwp.report,
      grid_factor_kgco2_per_kwh: r.factors.conv_kwh_co2,
      total_tco2eq: +(r.totals.total / 1000).toFixed(1),
      by_gas_tco2eq: { co2: +(r.totals.co2 / 1000).toFixed(1), ch4: +(r.totals.ch4 / 1000).toFixed(1), n2o: +(r.totals.n2o / 1000).toFixed(1) },
      energy_kwh: Math.round(r.energy_kwh),
      by_stage: Object.fromEntries(Object.entries(r.byStage).filter(([, v]) => v.count)
        .map(([k, v]) => [k, { tco2eq: +(v.total / 1000).toFixed(1), energy_kwh: Math.round(v.energy_kwh) }])),
      population: r.population,
    } : null,
    selected_actions: (actions || []).map(a => ({
      id: a.id, title: L(a.title), expected: expectedText(a, lang),
      expected_tco2eq: a.expected_kgco2 ? +(a.expected_kgco2 / 1000).toFixed(1) : null,
      expected_kwh: a.expected_kwh ? Math.round(a.expected_kwh) : null,
      scenario_assumption: L(a.scenario) || null, evidence: L(a.evidence),
      calculation_basis: a.basis, decision_condition: L(a.condition),
      user_notes: a.notes || null,
    })),
    plan: plan?.tasks ? { total_weeks: plan.total_weeks, summary: plan.summary || null, tasks: plan.tasks.map(t => `${t.id} [${t.action}] ${t.name} — ${t.owner}, week ${t.start_week}+${t.weeks}`) } : null,
  };
}

function templatePlanSummary(f, lang) {
  const r = f.ecam_results;
  const acts = f.selected_actions.filter(a => a.id !== 'A00');
  const totalT = acts.reduce((p, a) => p + (a.expected_tco2eq || 0), 0);
  if (lang === 'id') return [
    r ? `Penilaian ECAM untuk ${r.assessment} (${r.period.start} – ${r.period.end}) menunjukkan emisi ${fmt(r.total_tco2eq)} tCO2eq dan konsumsi listrik ${fmt(r.energy_kwh)} kWh.` : '',
    acts.length ? `Rencana ini mencakup ${acts.length} kegiatan: ${acts.map(a => a.title).join('; ')}.` : '',
    totalT ? `Pengurangan yang telah dihitung sekitar ${fmt(totalT)} tCO2eq per periode (sebagian berupa skenario, lihat asumsi).` : '',
    f.plan ? `Durasi keseluruhan sekitar ${f.plan.total_weeks} minggu. Setiap kegiatan diawali konfirmasi data dan syarat keputusan.` : '',
  ].filter(Boolean).join(' ');
  return [
    r ? `The ECAM assessment for ${r.assessment} (${r.period.start} – ${r.period.end}) shows ${fmt(r.total_tco2eq)} tCO2eq and ${fmt(r.energy_kwh)} kWh of grid electricity.` : '',
    acts.length ? `The plan covers ${acts.length} action(s): ${acts.map(a => a.title).join('; ')}.` : '',
    totalT ? `Calculated reductions add up to about ${fmt(totalT)} tCO2eq per assessment period (some are scenarios — see assumptions).` : '',
    f.plan ? `Overall duration is about ${f.plan.total_weeks} weeks. Each action starts by confirming its data and decision condition.` : '',
  ].filter(Boolean).join(' ');
}

async function planSummary(input) {
  const lang = input.lang || 'en';
  const f = facts(input);
  const src = retrieve(f, 'project implementation plan phases procurement permits regulation utility', PLAN_TOPICS);
  // template text cites nothing: retrieved passages are offered as related reading, not as sources
  if (!aiEnabled()) {
    return { text: templatePlanSummary(f, lang), sources: [], related: src.list, ai: false };
  }
  const system = fill(prompt('system-base'), { LANGUAGE: LANG_NAME[lang] });
  const text = await callClaude({ system, max_tokens: 900, messages: [{ role: 'user',
    content: fill(prompt('project-plan'), { LANGUAGE: LANG_NAME[lang] }) +
      '\n\nDATA:\n' + JSON.stringify(f, null, 1) +
      '\n\nSOURCES:\n' + (src.block || '(none available yet)') }] });
  return { text, sources: knowledge.citedSources(text, src.list), ai: true };
}

function templateSection(sec, f, lang) {
  const r = f.ecam_results;
  const todo = lang === 'id' ? `[Perlu dilengkapi: ${sec.guidance}]` : `[To be completed: ${sec.guidance}]`;
  if (['summary'].includes(sec.key)) return (f.plan?.summary || templatePlanSummary(f, lang)) + '\n\n' + todo;
  if (['baseline', 'rationale'].includes(sec.key) && r) return lang === 'id'
    ? `Total emisi ${fmt(r.total_tco2eq)} tCO2eq (CO2 ${fmt(r.by_gas_tco2eq.co2)}, CH4 ${fmt(r.by_gas_tco2eq.ch4)}, N2O ${fmt(r.by_gas_tco2eq.n2o)}) dihitung dengan ECAM v3, ${r.gwp_report}, faktor listrik ${r.grid_factor_kgco2_per_kwh} kgCO2/kWh.`
    : `Total emissions are ${fmt(r.total_tco2eq)} tCO2eq (CO2 ${fmt(r.by_gas_tco2eq.co2)}, CH4 ${fmt(r.by_gas_tco2eq.ch4)}, N2O ${fmt(r.by_gas_tco2eq.n2o)}), calculated with ECAM v3, ${r.gwp_report}, grid factor ${r.grid_factor_kgco2_per_kwh} kgCO2/kWh.`;
  if (['actions', 'impact'].includes(sec.key)) return f.selected_actions.filter(a => a.id !== 'A00')
    .map(a => `- ${a.id} ${a.title}: ${a.expected}. ${a.evidence}${a.scenario_assumption ? ' ' + a.scenario_assumption.replace(/[.!?]?\s*$/, '.') : ''}`).join('\n');
  return todo;
}

/**
 * Draft all sections of a financing framework.
 * framework: one of financingFrameworks() or a custom one parsed from a guide.
 */
async function draftProposal(input, framework, guideText) {
  const lang = input.lang || 'en';
  const f = facts(input);
  const L = o => (o && typeof o === 'object') ? (o[lang] || o.en) : o;
  const sections = [], failed = [];
  const useAI = aiEnabled();
  const system = fill(prompt('system-base'), { LANGUAGE: LANG_NAME[lang] });
  const data = JSON.stringify(f, null, 1);
  // sequential keeps rate use modest; sections are short
  for (const sec of framework.sections) {
    const title = sec[lang] || sec.en || sec.title;
    // baseline-type sections may also cite the ECAM method notes
    const topics = ['baseline', 'rationale', 'logframe', 'mrv'].includes(sec.key) ? [...FINANCE_TOPICS, 'ecam'] : FINANCE_TOPICS;
    const src = retrieve(f, `${sec.en || title} ${sec.guidance || ''} ${L(framework.name)}`, topics);
    let text, sources = [], related, ai = false;
    if (useAI) {
      const content = fill(prompt('proposal-section'), {
        SECTION: title, ROUTE: L(framework.name), GUIDANCE: sec.guidance, LANGUAGE: LANG_NAME[lang],
      }) + (guideText ? `\n\nFUNDING GUIDE EXCERPT:\n${guideText.slice(0, 12000)}` : '') +
        `\n\nDATA:\n${data}\n\nSOURCES:\n${src.block || '(none available yet)'}`;
      try {
        text = await callClaude({ system, max_tokens: 900, messages: [{ role: 'user', content }] });
        sources = knowledge.citedSources(text, src.list);
        ai = true;
      } catch (e) {
        // the error stays out of the document text; the section is marked as template
        text = templateSection(sec, f, lang);
        related = src.list;
        failed.push({ key: sec.key, title, error: e.message });
      }
    } else {
      text = templateSection(sec, f, lang);
      related = src.list;
    }
    sections.push({ key: sec.key, title, guidance: sec.guidance, text, sources, ...(related ? { related } : {}), ai });
  }
  return {
    route: framework.id, title: `${L(framework.name)} — ${f.utility_profile?.name || f.ecam_results?.assessment || ''}`.trim(), sections,
    ai: useAI && !failed.length, ...(failed.length ? { ai_failed: failed } : {}),
  };
}

/** Turn an uploaded funding guide into a section framework (AI), or a generic one. */
async function frameworkFromGuide(guideText, filename, lang = 'en') {
  const base = financingFrameworks().find(x => x.id === 'general');
  if (!aiEnabled()) {
    return { ...base, id: 'custom', name: { en: `Tailored to ${filename}`, id: `Disesuaikan dengan ${filename}` },
      _note: 'AI not configured: using the general structure. Set ANTHROPIC_API_KEY to read section requirements from the guide.' };
  }
  const out = await callClaude({
    system: 'You extract proposal structures from funding guidelines. Reply with JSON only.',
    max_tokens: 2000,
    messages: [{ role: 'user', content:
      `From this funding guide, list the sections a proposal must contain, in order, with what each must cover. Reply as JSON: {"name":"<fund or guide name>","sections":[{"key":"short_snake_key","en":"English title","id":"Indonesian title","guidance":"what the section must contain, incl. any page/word limits or required indicators"}],"requirements":["eligibility or formatting rules worth confirming with the user"]}\n\nGUIDE (${filename}):\n${guideText.slice(0, 60000)}` }],
  });
  const json = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  return { id: 'custom', name: { en: json.name, id: json.name }, sections: json.sections, requirements: json.requirements || [] };
}

module.exports = { facts, planSummary, draftProposal, financingFrameworks, frameworkFromGuide, fill, prompt, LANG_NAME };
