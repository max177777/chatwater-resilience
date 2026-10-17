/*
 * ChatWater Resilience — ECAM engine wrapper (server side).
 *
 * Runs the unmodified ECAM v3 backend (vendor/ecam/backend) inside a Node `vm`
 * context, so every number is produced by ECAM's own formulas. The browser
 * loads the very same files, so client and server results are identical.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BACKEND_DIR = path.join(__dirname, '..', 'vendor', 'ecam', 'backend');

// Same load order as ECAM's index.html
const FILES = [
  'questions', 'global', 'info', 'structure', 'countries', 'gwp_reports',
  'constants', 'tables', 'units', 'estimations', 'exceptions',
  'normalization', 'formulas', 'filters', 'benchmarks', 'references',
  'ipcc_categories',
];

const source = FILES
  .map(f => `//--- ${f}.js\n` + fs.readFileSync(path.join(BACKEND_DIR, f + '.js'), 'utf8'))
  .join('\n;\n') +
  `\n;globalThis.__ECAM = {Ecam, Structure, Countries, GWP_reports, Cts, Tables, Info, Questions, Estimations, Units,
     setGlobal(s){ Global = s; Scenarios = [s]; } };`;

const ctx = vm.createContext({ console });
new vm.Script(source, { filename: 'ecam-backend.js' }).runInContext(ctx);
const E = ctx.__ECAM;

const SUBSTAGE_KEYS = { // short names used in summaries
  'Water.Abstraction': 'wsa', 'Water.Treatment': 'wst', 'Water.Distribution': 'wsd',
  'Waste.Collection': 'wwc', 'Waste.Treatment': 'wwt', 'Waste.Onsite': 'wwo',
};

function clean(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = clean(v[k]);
    return o;
  }
  return v ?? null;
}

function setGwp(index) {
  const r = E.GWP_reports[index] || E.GWP_reports[0];
  E.Cts.ct_ch4_eq.value = r.ct_ch4_eq;
  E.Cts.ct_n2o_eq.value = r.ct_n2o_eq;
  return r;
}

/** Evaluate every published ECAM equation of one substage. */
function evaluateSubstage(cls, ss) {
  const outputs = {};
  for (const eq of cls.equations || []) {
    if (typeof ss[eq] !== 'function') continue;
    try { outputs[eq] = clean(ss[eq]()); } catch (e) { outputs[eq] = null; }
  }
  return outputs;
}

/**
 * Calculate one ECAM assessment (an object in ECAM's own JSON format, i.e. one
 * element of the array ECAM saves to file).
 */
function calculateOne(json, gwpIndex = 0) {
  const gwp = setGwp(gwpIndex);
  const s = E.Ecam.from(JSON.parse(JSON.stringify(json)));
  E.setGlobal(s);

  const g = s.General;
  const substages = [];
  for (const st of E.Structure.filter(x => x.sublevel)) {
    for (const ss of s[st.level][st.sublevel]) {
      const outputs = evaluateSubstage(st.class, ss);
      substages.push({
        level: st.level,
        sublevel: st.sublevel,
        prefix: st.prefix,
        name: ss.name,
        ghg: outputs[st.prefix + '_KPI_GHG'] || null,
        energy_kwh: clean(ss[st.prefix + '_nrg_cons'] || 0),
        outputs,
      });
    }
  }

  const sum = arr => arr.reduce((p, c) => p + (c || 0), 0);
  const byStage = {};
  for (const [key, prefix] of Object.entries(SUBSTAGE_KEYS)) {
    const list = substages.filter(x => `${x.level}.${x.sublevel}` === key);
    byStage[prefix] = {
      count: list.length,
      total: sum(list.map(x => x.ghg && x.ghg.total)),
      co2: sum(list.map(x => x.ghg && x.ghg.co2)),
      ch4: sum(list.map(x => x.ghg && x.ghg.ch4)),
      n2o: sum(list.map(x => x.ghg && x.ghg.n2o)),
      energy_kwh: sum(list.map(x => x.energy_kwh)),
    };
  }

  const ws_serv_pop = clean(s.Water.ws_serv_pop());
  const ww_serv_pop = clean(s.Waste.ww_serv_pop ? s.Waste.ww_serv_pop() : null);

  return {
    name: g.Name,
    country: g.Country,
    currency: g.Currency,
    period: { start: g.AssessmentPeriodStart, end: g.AssessmentPeriodEnd, days: clean(s.Days()) },
    gwp: { report: gwp.report, ch4: gwp.ct_ch4_eq, n2o: gwp.ct_n2o_eq },
    factors: { conv_kwh_co2: g.conv_kwh_co2, prot_con: g.prot_con, bod_pday: g.bod_pday },
    population: {
      ws_resi_pop: s.Water.ws_resi_pop, ws_serv_pop,
      ww_resi_pop: s.Waste.ww_resi_pop, ww_serv_pop,
    },
    totals: clean(s.TotalGHG()),       // kgCO2eq for the whole assessment period
    energy_kwh: clean(s.TotalNRG()),
    water: clean(s.Water.ws_KPI_GHG()),
    waste: clean(s.Waste.ww_KPI_GHG()),
    byStage,
    substages,
  };
}

/** Accepts one assessment or the array ECAM saves to file. */
function calculate(input, opts = {}) {
  const list = Array.isArray(input) ? input : [input];
  return list.map(a => calculateOne(a, opts.gwpIndex || 0));
}

/** Fresh empty assessment in ECAM's JSON format, optionally preset to a country. */
function newAssessment(country) {
  const s = new E.Ecam();
  if (country && E.Countries[country]) {
    const c = E.Countries[country];
    Object.assign(s.General, {
      Country: country, Currency: c.currency,
      conv_kwh_co2: c.conv_kwh_co2, prot_con: c.prot_con, bod_pday: c.bod_pday,
    });
  }
  return JSON.parse(JSON.stringify(s));
}

/** Add a substage of a given type (prefix) with ECAM's own defaults. */
function newSubstage(prefix, name, conv_kwh_co2 = 0) {
  const st = E.Structure.find(x => x.prefix === prefix && x.sublevel);
  if (!st) throw new Error('Unknown substage prefix ' + prefix);
  const ss = new st.class(name || st.sublevel + ' 1');
  ss[prefix + '_conv_kwh'] = conv_kwh_co2;
  return JSON.parse(JSON.stringify(ss));
}

/**
 * Scenario: clone an assessment, let `mutate(clone, estimations)` change
 * inputs, and recompute with ECAM. `estimations` are ECAM's own estimation
 * formulas, evaluated against the clone. Returns {base, scenario, delta_kgco2, delta_kwh}.
 */
function rerun(json, mutate, gwpIndex = 0) {
  const base = calculateOne(json, gwpIndex);
  const clone = JSON.parse(JSON.stringify(json));
  const s = E.Ecam.from(clone);
  E.setGlobal(s);
  const est = (code, ss) => E.Estimations[code](ss);
  mutate(s, est);
  const scenario = calculateOne(JSON.parse(JSON.stringify(s)), gwpIndex);
  return {
    base, scenario,
    delta_kgco2: base.totals.total - scenario.totals.total,
    delta_kwh: base.energy_kwh - scenario.energy_kwh,
  };
}

module.exports = {
  calculate, calculateOne, newAssessment, newSubstage, rerun,
  countries: () => JSON.parse(JSON.stringify(E.Countries)),
  gwpReports: () => JSON.parse(JSON.stringify(E.GWP_reports)),
  _ecam: E,
};
