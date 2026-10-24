/*
 * Stage 2 — rule-based improvement options derived from ECAM results.
 *
 * Every figure shown to the user comes from an ECAM output (engine results) or
 * from an explicitly stated scenario assumption. The AI layer may explain and
 * refine these options, but it never invents the numbers.
 *
 * To add a rule: push an object to RULES with
 *   id, applies(r) -> array of matches, build(match, r) -> option fields,
 *   trigger(match, r) -> the condition in words plus the values it read.
 */

const Data = require('../public/js/result-status');
const t = (kg) => kg / 1000; // kg -> t
const fmt = (n, d = 0) => (n == null || !Number.isFinite(n)) ? '–'
  : n.toLocaleString('en-US', { maximumFractionDigits: d });
const fmtId = (n, d = 0) => (n == null || !Number.isFinite(n)) ? '–'
  : n.toLocaleString('id-ID', { maximumFractionDigits: d });

// Scenario assumptions are explicit and editable here (and shown in the UI).
const ASSUMPTIONS = {
  nrw_reduction_points: 5,     // percentage points of water loss reduced in scenario
  solar_share: 0.10,           // share of grid electricity replaced by solar PV
  desludging_emptied_pct: 33,  // % of produced faecal sludge emptied per year (scheduled desludging about every 3 years)
  biogas_capture: 0.5,         // share of WWTP treatment CH4 captured in scenario
};

// Trigger thresholds used by the rules below (and reported by ruleChecks).
const NRW_TRIGGER = 0.15;      // water-loss share above which water-loss reduction is offered

function substages(r, prefix) { return r.substages.filter(s => s.prefix === prefix); }

// Review flag for display only; it never changes which options are offered or their figures.
// ECAM's pump saving is nrg_cons − (efficiency / expected efficiency) × nrg_pump.
function pumpReview(s) {
  const i = s.inputs || {}, pump = i[s.prefix + '_nrg_pump'] || 0, total = i[s.prefix + '_nrg_cons'] || 0;
  return pump === 0 || pump !== total ? ['pump_energy_basis'] : [];
}

// trigger(match, r): the rule's own condition in words, with the assessment values it read.
// values: { code } = ECAM variable (labelled from ECAM's dictionary) or { label } = interface key.
const RULES = [
  {
    id: 'pump_upgrade',
    applies: r => ['wsa', 'wsd', 'wwc', 'wwo', 'wst', 'wwt'].flatMap(p => substages(r, p))
      .filter(s => {
        const eff = s.outputs[s.prefix + '_KPI_nrg_elec_eff'];
        const sav = s.outputs[s.prefix + '_KPI_nrg_estm_sav'];
        return eff > 0 && sav > 0;
      }),
    trigger: s => {
      const p = s.prefix, o = s.outputs;
      return {
        text: {
          en: 'ECAM estimates an energy saving above zero if this pump reached its expected efficiency.',
          id: 'ECAM memperkirakan penghematan energi di atas nol bila pompa ini mencapai efisiensi yang diharapkan.',
        },
        values: [
          { code: p + '_KPI_nrg_elec_eff', value: o[p + '_KPI_nrg_elec_eff'], unit: '%' },
          { code: p + '_pmp_exff', value: s.inputs?.[p + '_pmp_exff'], unit: '%' },
          { code: p + '_KPI_nrg_estm_sav', value: o[p + '_KPI_nrg_estm_sav'], unit: 'kWh' },
          { code: p + '_nrg_pump', value: s.inputs?.[p + '_nrg_pump'] ?? null, unit: 'kWh' },
          { code: p + '_nrg_cons', value: s.inputs?.[p + '_nrg_cons'] ?? null, unit: 'kWh' },
        ],
        review: pumpReview(s),
      };
    },
    build: (s) => {
      const p = s.prefix, o = s.outputs;
      return {
        category: 'energy',
        title: { en: `Upgrade pump system – ${s.name}`, id: `Peningkatan sistem pompa – ${s.name}` },
        expected_kwh: o[p + '_KPI_nrg_estm_sav'],
        expected_kgco2: o[p + '_KPI_ghg_estm_red'],
        evidence: {
          en: `Measured electromechanical efficiency is ${fmt(o[p + '_KPI_nrg_elec_eff'], 1)}% against an expected ${fmt(s.inputs?.[p + '_pmp_exff'], 0)}%.`,
          id: `Efisiensi elektromekanis terukur ${fmtId(o[p + '_KPI_nrg_elec_eff'], 1)}% dibandingkan target ${fmtId(s.inputs?.[p + '_pmp_exff'], 0)}%.`,
        },
        basis_text: { en: "ECAM's estimated energy saving and emission reduction if this pump reached its expected efficiency.", id: "Perkiraan penghematan energi dan penurunan emisi dari ECAM bila pompa ini mencapai efisiensi yang diharapkan." },
        basis: `ECAM ${p}_KPI_nrg_estm_sav and ${p}_KPI_ghg_estm_red`,
        condition: { en: 'Duty-point test and design review', id: 'Uji titik kerja dan tinjauan desain' },
      };
    },
  },
  {
    id: 'pump_audit',
    applies: r => ['wsa', 'wsd', 'wwc'].flatMap(p => substages(r, p))
      .filter(s => s.energy_kwh > 0 && !(s.outputs[s.prefix + '_KPI_nrg_elec_eff'] > 0)),
    trigger: s => ({
      text: {
        en: 'This stage uses grid electricity, but ECAM has no pump efficiency for it (pump-efficiency inputs not answered).',
        id: 'Tahap ini memakai listrik PLN, tetapi ECAM belum memiliki efisiensi pompanya (isian efisiensi pompa belum dijawab).',
      },
      values: [{ label: 'grid_kwh', value: s.energy_kwh, unit: 'kWh' }],
    }),
    build: (s, r) => ({
      category: 'energy',
      title: { en: `Verify pump performance – ${s.name}`, id: `Verifikasi kinerja pompa – ${s.name}` },
      expected_kwh: null, expected_kgco2: null,
      expected_text: { en: 'Evidence for a decision', id: 'Bukti untuk pengambilan keputusan' },
      evidence: {
        en: `${fmt(s.energy_kwh)} kWh grid electricity (${fmt(r.energy_kwh == null ? null : 100 * s.energy_kwh / r.energy_kwh, 0)}% of the utility total) but no pump efficiency data yet.`,
        id: `${fmtId(s.energy_kwh)} kWh listrik PLN (${fmtId(r.energy_kwh == null ? null : 100 * s.energy_kwh / r.energy_kwh, 0)}% dari total) tetapi belum ada data efisiensi pompa.`,
      },
      basis_text: { en: "The electricity entered in ECAM for this stage; the pump-efficiency questions are not answered yet.", id: "Listrik yang diisikan di ECAM untuk tahap ini; pertanyaan efisiensi pompa belum dijawab." },
        basis: 'ECAM energy inputs; pump-efficiency questions not answered',
      condition: { en: 'Audit scope and cost', id: 'Lingkup dan biaya audit' },
    }),
  },
  {
    id: 'nrw_reduction',
    applies: r => substages(r, 'wsd').filter(s => s.inputs?.wsd_vol_dist > 0 && s.inputs?.wsd_auth_con > 0
      && (1 - s.inputs.wsd_auth_con / s.inputs.wsd_vol_dist) > NRW_TRIGGER),
    trigger: s => ({
      text: {
        en: `Water loss is above ${NRW_TRIGGER * 100}% (distributed water not counted as authorized consumption).`,
        id: `Kehilangan air di atas ${NRW_TRIGGER * 100}% (air yang didistribusikan tetapi tidak tercatat sebagai konsumsi resmi).`,
      },
      values: [
        { code: 'wsd_vol_dist', value: s.inputs.wsd_vol_dist, unit: 'm³' },
        { code: 'wsd_auth_con', value: s.inputs.wsd_auth_con, unit: 'm³' },
        { label: 'nrw_share', value: 100 * (1 - s.inputs.wsd_auth_con / s.inputs.wsd_vol_dist), unit: '%' },
      ],
    }),
    build: (s, r) => {
      const i = s.inputs;
      const nrw = 1 - i.wsd_auth_con / i.wsd_vol_dist;
      // kWh per m3 for the whole water-supply chain (abstraction + treatment + distribution)
      const wsKwh = ['wsa', 'wst', 'wsd'].reduce((p, k) => p + r.byStage[k].energy_kwh, 0);
      const kwhPerM3 = wsKwh / i.wsd_vol_dist;
      const m3Saved = i.wsd_vol_dist * ASSUMPTIONS.nrw_reduction_points / 100;
      const kwh = m3Saved * kwhPerM3;
      return {
        category: 'water',
        title: { en: `Reduce water loss – ${s.name}`, id: `Penurunan kehilangan air – ${s.name}` },
        expected_kwh: kwh, expected_kgco2: kwh * r.factors.conv_kwh_co2,
        scenario: {
          en: `Scenario: water loss cut by ${ASSUMPTIONS.nrw_reduction_points} percentage points at ${fmt(kwhPerM3, 2)} kWh/m³`,
          id: `Skenario: kehilangan air turun ${ASSUMPTIONS.nrw_reduction_points} poin persen pada ${fmtId(kwhPerM3, 2)} kWh/m³`,
        },
        evidence: {
          en: `Water loss is about ${fmt(100 * nrw, 0)}% (distributed ${fmt(i.wsd_vol_dist)} m³, authorized consumption ${fmt(i.wsd_auth_con)} m³).`,
          id: `Kehilangan air sekitar ${fmtId(100 * nrw, 0)}% (didistribusikan ${fmtId(i.wsd_vol_dist)} m³, konsumsi resmi ${fmtId(i.wsd_auth_con)} m³).`,
        },
        basis_text: { en: "Distributed volume, authorised consumption and water-supply electricity from ECAM; the reduction itself is a scenario.", id: "Volume air yang didistribusikan, konsumsi resmi, dan listrik air minum dari ECAM; besar penurunannya berupa skenario." },
        basis: 'ECAM wsd_vol_dist, wsd_auth_con and water-supply energy inputs',
        condition: { en: 'Water balance (IWA) and DMA metering', id: 'Neraca air (IWA) dan meter DMA' },
      };
    },
  },
  {
    id: 'septic_desludging',
    // ECAM: containment CH4 = (BOD entering - BOD removed as faecal sludge) x EF.
    // The scenario raises the emptied fraction and re-runs ECAM with its own
    // estimation formulas for sludge volume and BOD removed.
    applies: r => substages(r, 'wwo').filter(s => (s.outputs.wwo_KPI_GHG_containment?.total || 0) > 0
      && (s.inputs?.wwo_cont_emp || 0) < ASSUMPTIONS.desludging_emptied_pct),
    trigger: s => ({
      text: {
        en: `Containment emits greenhouse gases and less than ${ASSUMPTIONS.desludging_emptied_pct}% of faecal sludge is emptied per year (the scenario's emptying rate).`,
        id: `Penampungan mengemisikan gas rumah kaca dan kurang dari ${ASSUMPTIONS.desludging_emptied_pct}% lumpur tinja dikuras per tahun (tingkat pengurasan dalam skenario).`,
      },
      values: [
        { label: 'containment_ghg', value: t(s.outputs.wwo_KPI_GHG_containment.total), unit: 'tCO₂eq' },
        { code: 'wwo_cont_emp', value: s.inputs?.wwo_cont_emp || 0, unit: '%' },
      ],
    }),
    build: (s, r, ctx) => {
      const ghg = s.outputs.wwo_KPI_GHG_containment.total;
      const idx = r.substages.filter(x => x.prefix === 'wwo').indexOf(s);
      const run = ctx.engine.rerun(ctx.assessment, (a, est) => {
        const ss = a.Waste.Onsite[idx];
        ss.wwo_cont_emp = ASSUMPTIONS.desludging_emptied_pct;
        ss.wwo_fslu_emp = est('wwo_fslu_emp', ss);
        ss.wwo_bod_rmvd = est('wwo_bod_rmvd', ss);
      }, ctx.gwpIndex);
      return {
        category: 'sanitation',
        title: { en: `Scheduled desludging – ${s.name}`, id: `Layanan lumpur tinja terjadwal (LLTT) – ${s.name}` },
        expected_kwh: 0, expected_kgco2: run.delta_kgco2,
        // expected_kwh stays 0 for compatibility; no energy change (trucks, sludge treatment) is calculated.
        benefit_status: { kwh: 'not_quantified' },
        scenario: {
          en: `ECAM re-run: ${ASSUMPTIONS.desludging_emptied_pct}% of faecal sludge emptied per year (now ${s.inputs?.wwo_cont_emp || 0}%). Emissions from treating the emptied sludge are not yet included.`,
          id: `Hitung ulang ECAM: ${ASSUMPTIONS.desludging_emptied_pct}% lumpur tinja dikuras per tahun (saat ini ${s.inputs?.wwo_cont_emp || 0}%). Emisi pengolahan lumpur yang dikuras belum termasuk.`,
        },
        evidence: {
          en: `Containment emits ${fmt(t(ghg))} tCO2eq, ${fmt(100 * ghg / r.totals.total, 0)}% of the utility total.`,
          id: `Penampungan menghasilkan ${fmtId(t(ghg))} tCO2eq, ${fmtId(100 * ghg / r.totals.total, 0)}% dari total.`,
        },
        basis_text: { en: "ECAM containment emissions, recalculated with ECAM's own estimates of the sludge emptied and the organic load (BOD) it removes.", id: "Emisi penampungan dari ECAM, dihitung ulang dengan perkiraan ECAM sendiri untuk lumpur yang dikuras dan beban organik (BOD) yang ikut terbuang." },
        basis: 'ECAM wwo_KPI_GHG_containment, re-run with Estimations.wwo_fslu_emp and wwo_bod_rmvd',
        condition: { en: 'Containment survey and IPLT (sludge treatment) capacity', id: 'Survei penampungan dan kapasitas IPLT' },
      };
    },
  },
  {
    id: 'cso_reduction',
    applies: r => substages(r, 'wwc').filter(s => (s.outputs.wwc_KPI_GHG_cso?.total || 0) > 0),
    trigger: s => ({
      text: {
        en: 'Part of the collected wastewater is discharged untreated, and ECAM calculates emissions from it.',
        id: 'Sebagian air limbah terkumpul dibuang tanpa pengolahan, dan ECAM menghitung emisinya.',
      },
      values: [
        { code: 'wwc_vol_coll_unt', value: s.inputs?.wwc_vol_coll_unt, unit: 'm³' },
        { label: 'cso_ghg', value: t(s.outputs.wwc_KPI_GHG_cso.total), unit: 'tCO₂eq' },
      ],
    }),
    build: (s, r) => {
      const ghg = s.outputs.wwc_KPI_GHG_cso.total;
      return {
        category: 'sanitation',
        title: { en: `Route untreated sewage to treatment – ${s.name}`, id: `Alirkan air limbah tak terolah ke pengolahan – ${s.name}` },
        expected_kwh: null, expected_kgco2: ghg,
        expected_text: { en: 'Up to the full untreated-discharge emission', id: 'Hingga seluruh emisi pembuangan tak terolah' },
        evidence: {
          en: `${fmt(s.inputs?.wwc_vol_coll_unt)} m³ collected wastewater is discharged untreated: ${fmt(t(ghg), 1)} tCO2eq.`,
          id: `${fmtId(s.inputs?.wwc_vol_coll_unt)} m³ air limbah terkumpul dibuang tanpa pengolahan: ${fmtId(t(ghg), 1)} tCO2eq.`,
        },
        basis_text: { en: "ECAM emissions from collected wastewater discharged untreated. This is an upper bound: treating the water would add some treatment emissions.", id: "Emisi ECAM dari air limbah terkumpul yang dibuang tanpa pengolahan. Ini batas atas: mengolah air tersebut akan menambah sebagian emisi pengolahan." },
        basis: 'ECAM wwc_KPI_GHG_cso (upper bound; treatment emissions would partly replace it)',
        condition: { en: 'Hydraulic study and WWTP spare capacity', id: 'Studi hidrolika dan kapasitas cadangan IPAL' },
      };
    },
  },
  {
    id: 'biogas_capture',
    // only anaerobic processes (IPCC CH4 factor >= 0.1 kgCH4/kgBOD) have recoverable methane
    applies: r => substages(r, 'wwt').filter(s => (s.outputs.wwt_KPI_GHG_tre?.ch4 || 0) > 0 && s.inputs?.wwt_ch4_efac_tre >= 0.1),
    trigger: s => ({
      text: {
        en: 'Treatment emits CH4 and the process CH4 factor is at least 0.1 kgCH4/kgBOD (anaerobic processes).',
        id: 'Pengolahan mengemisikan CH4 dan faktor CH4 prosesnya minimal 0,1 kgCH4/kgBOD (proses anaerobik).',
      },
      values: [
        { label: 'treatment_ch4', value: t(s.outputs.wwt_KPI_GHG_tre.ch4), unit: 'tCO₂eq' },
        { code: 'wwt_ch4_efac_tre', value: s.inputs?.wwt_ch4_efac_tre, unit: 'kgCH₄/kgBOD' },
      ],
    }),
    build: (s) => {
      const ch4 = s.outputs.wwt_KPI_GHG_tre.ch4;
      return {
        category: 'sanitation',
        title: { en: `Methane capture at treatment – ${s.name}`, id: `Penangkapan metana di pengolahan – ${s.name}` },
        expected_kwh: null, expected_kgco2: ch4 * ASSUMPTIONS.biogas_capture,
        scenario: {
          en: `Scenario: ${ASSUMPTIONS.biogas_capture * 100}% of treatment CH4 captured`,
          id: `Skenario: ${ASSUMPTIONS.biogas_capture * 100}% CH4 pengolahan ditangkap`,
        },
        evidence: {
          en: `Treatment process emits ${fmt(t(ch4), 1)} tCO2eq as CH4.`,
          id: `Proses pengolahan mengemisikan ${fmtId(t(ch4), 1)} tCO2eq sebagai CH4.`,
        },
        basis_text: { en: "ECAM methane (CH₄) emissions from the treatment process; the captured share is a scenario.", id: "Emisi metana (CH₄) dari proses pengolahan menurut ECAM; bagian yang ditangkap berupa skenario." },
        basis: 'ECAM wwt_KPI_GHG_tre (CH4)',
        condition: { en: 'Biogas yield test and gas-use options', id: 'Uji hasil biogas dan opsi pemanfaatan gas' },
      };
    },
  },
  {
    id: 'fuel_switch',
    applies: r => r.substages.filter(s => (s.outputs[s.prefix + '_KPI_GHG_fuel']?.total || 0) > 0),
    trigger: s => ({
      text: { en: 'On-site fuel use produces emissions in ECAM.', id: 'Penggunaan bahan bakar di lokasi menghasilkan emisi dalam ECAM.' },
      values: [{ label: 'fuel_ghg', value: t(s.outputs[s.prefix + '_KPI_GHG_fuel'].total), unit: 'tCO₂eq' }],
    }),
    build: (s) => {
      const ghg = s.outputs[s.prefix + '_KPI_GHG_fuel'].total;
      return {
        category: 'energy',
        title: { en: `Reduce diesel use in engines – ${s.name}`, id: `Kurangi penggunaan solar pada genset – ${s.name}` },
        expected_kwh: null, expected_kgco2: null,
        expected_text: { en: `Benefit not yet calculated (fuel emits ${fmt(t(ghg), 1)} tCO2eq)`, id: `Manfaat belum dihitung (bahan bakar ${fmtId(t(ghg), 1)} tCO2eq)` },
        evidence: { en: `On-site engines emit ${fmt(t(ghg), 1)} tCO2eq.`, id: `Mesin di lokasi mengemisikan ${fmtId(t(ghg), 1)} tCO2eq.` },
        basis_text: { en: "ECAM emissions from fuel burned on site.", id: "Emisi ECAM dari bahan bakar yang dibakar di lokasi." },
        basis: `ECAM ${s.prefix}_KPI_GHG_fuel`,
        condition: { en: 'Generator run-hours log and grid reliability', id: 'Catatan jam operasi genset dan keandalan listrik' },
      };
    },
  },
  {
    id: 'solar_pv',
    applies: r => r.energy_kwh > 0 ? [r] : [],
    trigger: (_, r) => ({
      text: { en: 'The utility uses grid electricity.', id: 'Utilitas memakai listrik PLN.' },
      values: [
        { label: 'grid_kwh', value: r.energy_kwh, unit: 'kWh' },
        { code: 'conv_kwh_co2', value: r.factors.conv_kwh_co2, unit: 'kgCO₂/kWh' },
      ],
    }),
    build: (_, r) => {
      const kwh = r.energy_kwh * ASSUMPTIONS.solar_share;
      return {
        category: 'energy',
        title: { en: 'Solar PV at utility sites', id: 'PLTS atap/terapung di lokasi utilitas' },
        expected_kwh: kwh, expected_kgco2: kwh * r.factors.conv_kwh_co2,
        scenario: {
          en: `Scenario: ${ASSUMPTIONS.solar_share * 100}% of grid electricity replaced`,
          id: `Skenario: ${ASSUMPTIONS.solar_share * 100}% listrik PLN digantikan`,
        },
        evidence: {
          en: `Utility uses ${fmt(r.energy_kwh)} kWh of grid electricity at ${r.factors.conv_kwh_co2} kgCO2/kWh.`,
          id: `Utilitas memakai ${fmtId(r.energy_kwh)} kWh listrik PLN dengan faktor ${fmtId(r.factors.conv_kwh_co2, 3)} kgCO2/kWh.`,
        },
        basis_text: { en: "Total grid electricity in ECAM multiplied by the grid emission factor; the replaced share is a scenario.", id: "Total listrik PLN dalam ECAM dikalikan faktor emisi jaringan; bagian yang digantikan berupa skenario." },
        basis: 'ECAM TotalNRG x conv_kwh_co2',
        condition: { en: 'Site area, PLN net-metering rules and tariff', id: 'Luas lahan, aturan PLN dan tarif' },
      };
    },
  },
];

/**
 * @param results engine.calculateOne() output
 * @param assessment the ECAM JSON (to read inputs and re-run scenarios)
 * @param engine     engine/ecam-engine (for ECAM re-runs)
 */
function suggestActions(results, assessment, engine, gwpIndex = 0, inputStatus = null) {
  const ctx = { assessment, engine, gwpIndex };
  const statusFor=(rule,s)=>Data.actionStatus(rule,s,results,{assessment,inputStatus,Info:engine._ecam.Info,Tables:engine._ecam.Tables});
  // attach raw inputs to each substage result (same order as the engine)
  const order = [['Water', 'Abstraction'], ['Water', 'Treatment'], ['Water', 'Distribution'],
    ['Waste', 'Collection'], ['Waste', 'Treatment'], ['Waste', 'Onsite']];
  let i = 0;
  for (const [lv, sl] of order) for (const ss of assessment[lv][sl]) results.substages[i++].inputs = ss;
  // position of each substage within its stage, so callers can give the option a stable identity
  const where = new Map(), count = {};
  for (const s of results.substages) { count[s.prefix] = count[s.prefix] || 0; where.set(s, { prefix: s.prefix, index: count[s.prefix]++ }); }

  const options = [{
    id: 'A00', rule: 'baseline', category: 'baseline',
    title: { en: 'Keep current practice', id: 'Pertahankan praktik saat ini' },
    expected_text: { en: 'Comparison baseline', id: 'Garis dasar pembanding' },
    expected_kwh: results.completeness && !results.completeness.complete ? null : 0, expected_kgco2: results.completeness && !results.completeness.complete ? null : 0,
    evidence: {
      en: `Baseline${results.completeness && !results.completeness.complete ? ' (incomplete: unavailable components)' : ''}: ${fmt(results.totals.total == null ? null : t(results.totals.total))} tCO2eq and ${fmt(results.energy_kwh)} kWh over ${fmt(results.period.days)} days.`,
      id: `Garis dasar${results.completeness && !results.completeness.complete ? ' (tidak lengkap)' : ''}: ${fmtId(results.totals.total == null ? null : t(results.totals.total))} tCO2eq dan ${fmtId(results.energy_kwh)} kWh selama ${fmtId(results.period.days)} hari.`,
    },
    basis_text: { en: "ECAM total emissions and total energy use.", id: "Total emisi dan total penggunaan energi menurut ECAM." },
        basis: 'ECAM TotalGHG, TotalNRG',
    condition: { en: 'No claimed saving', id: 'Tidak ada klaim penghematan' },
  }];
  for (const rule of RULES) {
    for (const m of rule.applies(results)) {
      const support=statusFor(rule.id,m);
      if (support.status!=='available') continue;
      options.push({ availability:support, rule: rule.id, ...rule.build(m, results, ctx), trigger: rule.trigger(m, results), substage: where.get(m) || null });
    }
  }
  const checks = ruleChecks(results, where, statusFor);
  const status = v => (typeof v === 'number' && Number.isFinite(v) ? 'quantified' : 'not_quantified');
  options.forEach(o => {
    if (o.rule === 'pump_upgrade' && o.trigger?.review?.includes('pump_energy_basis')) {
      const warning = {en:'Provisional estimate: ECAM subtracts estimated new pump electricity from total substage electricity. Other equipment may be included in the saving. A pump-only boundary has not been established; Chimdi must approve the methodology before this benefit is used.', id:'Perkiraan sementara: ECAM mengurangi listrik pompa baru dari listrik total subtahap. Penghematan dapat mencakup peralatan lain. Batas khusus pompa belum ditetapkan; Chimdi perlu menyetujui metodologinya sebelum manfaat ini digunakan.'};
      o.provisional_warning = warning;
      for (const lang of ['en','id']) o.condition[lang] += ' ' + warning[lang];
      for (const lang of ['en','id']) o.basis_text[lang] += ' ' + warning[lang];
    }
    o.benefit_status = { kgco2: status(o.expected_kgco2), kwh: status(o.expected_kwh), ...o.benefit_status };
  });
  options.forEach((o, k) => { if (!o.id) o.id = 'A' + String(k).padStart(2, '0'); });
  // largest calculated reductions first, keeping the baseline on top
  const [base, ...rest] = options;
  rest.sort((a, b) => (b.expected_kgco2 || 0) - (a.expected_kgco2 || 0));
  rest.forEach((o, k) => { o.id = 'A' + String(k + 1).padStart(2, '0'); });
  const availability_checks = results.coverage ? Object.keys(Data.ACTIONS).flatMap(rule => rule==='solar_pv' ? [{rule,...statusFor(rule,null)}] : results.substages.filter(s => ({nrw_reduction:['wsd'],septic_desludging:['wwo'],cso_reduction:['wwc'],biogas_capture:['wwt'],pump_audit:['wsa','wsd','wwc']}[rule] || ['wsa','wst','wsd','wwc','wwt','wwo']).includes(s.prefix)).map(s => ({rule,prefix:s.prefix,name:s.name,...statusFor(rule,s)}))) : [];
  return { assumptions: ASSUMPTIONS, options: [base, ...rest], checks, availability_checks };
}

/*
 * Missing-data coverage for a small set of rules. Each check restates its rule's own
 * condition and reports one of:
 *   triggered      the rule's condition holds (the rule produced an option)
 *   not_triggered  the inputs it reads were present and the condition does not hold
 *   not_assessed   an input or ECAM output the condition needs is missing or zero
 * Requirements beyond the existing conditions are not enforced here; they are listed
 * for domain review in docs/decision-support-review.md.
 */
// untracked: inputs the rule or its estimate is known to read (from the ECAM formulas and the
// rule code) without input-status tracking. Known dependencies only, not a complete list.
const PUMP_KEYS = ['flow', 'head', 'volt', 'amps', 'pf'];
const CHECKS = [
  {
    id: 'pump_efficiency', rules: ['pump_upgrade', 'pump_audit'], prefixes: ['wsa', 'wsd', 'wwc'],
    inputs: p => [...PUMP_KEYS, 'exff'].map(k => `${p}_pmp_${k}`),
    untracked: p => [`${p}_nrg_pump`, `${p}_nrg_cons`, ...(p === 'wwc' ? ['wwc_vol_pump'] : []), `${p}_conv_kwh`],
    evaluate: s => {
      const p = s.prefix, i = s.inputs || {};
      const eff = s.outputs[p + '_KPI_nrg_elec_eff'], sav = s.outputs[p + '_KPI_nrg_estm_sav'];
      if (!(eff > 0)) return { status: 'not_assessed', reason: 'no_efficiency', missing: PUMP_KEYS.map(k => `${p}_pmp_${k}`).filter(c => !(i[c] > 0)) };
      if (!(i[p + '_pmp_exff'] > 0) || sav == null) return { status: 'not_assessed', reason: 'no_expected_efficiency', missing: [p + '_pmp_exff'] };
      return sav > 0 ? { status: 'triggered', review: pumpReview(s) } : { status: 'not_triggered', reason: 'saving_not_positive' };
    },
  },
  {
    id: 'nrw', rules: ['nrw_reduction'], prefixes: ['wsd'],
    inputs: () => ['wsd_vol_dist', 'wsd_auth_con'],
    untracked: () => ['wsa_nrg_cons', 'wst_nrg_cons', 'wsd_nrg_cons', 'conv_kwh_co2'],
    evaluate: s => {
      const i = s.inputs || {};
      const missing = ['wsd_vol_dist', 'wsd_auth_con'].filter(c => !(i[c] > 0));
      if (missing.length) return { status: 'not_assessed', reason: 'missing_volumes', missing };
      return (1 - i.wsd_auth_con / i.wsd_vol_dist) > NRW_TRIGGER ? { status: 'triggered' } : { status: 'not_triggered', reason: 'nrw_at_or_below_trigger', limit: NRW_TRIGGER * 100 };
    },
  },
  {
    id: 'desludging', rules: ['septic_desludging'], prefixes: ['wwo'],
    inputs: () => ['wwo_cont_emp'],
    untracked: () => ['wwo_bod_cont', 'wwo_bod_rmvd', 'wwo_ch4_efac_con'],
    evaluate: s => {
      if (!((s.outputs.wwo_KPI_GHG_containment?.total || 0) > 0)) return { status: 'not_assessed', reason: 'no_containment_emissions', missing: [] };
      return (s.inputs?.wwo_cont_emp || 0) < ASSUMPTIONS.desludging_emptied_pct ? { status: 'triggered' } : { status: 'not_triggered', reason: 'emptying_at_or_above_scenario', limit: ASSUMPTIONS.desludging_emptied_pct };
    },
  },
];

/** One entry per covered check and substage. where: substage result -> { prefix, index }. */
function ruleChecks(results, where, statusFor) {
  const out = [];
  for (const c of CHECKS) {
    for (const s of results.substages.filter(x => c.prefixes.includes(x.prefix))) {
      const support=results.coverage?statusFor(c.rules[0],s):null;
      const blocked=support&&support.status!=='available';
      out.push({
        check: c.id, rules: c.rules, substage: where.get(s), name: s.name,
        inputs: c.inputs(s.prefix).map(code => ({ code, value: results.coverage ? s.input_availability?.[code]?.value ?? null : s.inputs?.[code] ?? null })),
        untracked: results.coverage ? [] : c.untracked(s.prefix), missing: [], reason: null, review: [], ...c.evaluate(s),
        ...(support?{availability:support}:{}),
        ...(blocked?{status:'not_assessed',reason:'dependency_unavailable',missing:support.missing}:{}),
      });
    }
  }
  return out;
}

module.exports = { suggestActions, ASSUMPTIONS, NRW_TRIGGER, CHECK_IDS: CHECKS.map(c => c.id) };
