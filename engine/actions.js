/*
 * Stage 2 — rule-based improvement options derived from ECAM results.
 *
 * Every figure shown to the user comes from an ECAM output (engine results) or
 * from an explicitly stated scenario assumption. The AI layer may explain and
 * refine these options, but it never invents the numbers.
 *
 * To add a rule: push an object to RULES with
 *   id, applies(r) -> array of matches, build(match, r) -> option fields.
 */

const t = (kg) => kg / 1000; // kg -> t
const fmt = (n, d = 0) => (n == null || !Number.isFinite(n)) ? '–'
  : n.toLocaleString('en-US', { maximumFractionDigits: d });

// Scenario assumptions are explicit and editable here (and shown in the UI).
const ASSUMPTIONS = {
  nrw_reduction_points: 5,     // percentage points of NRW reduced in scenario
  solar_share: 0.10,           // share of grid electricity replaced by solar PV
  desludging_emptied_pct: 33,  // % of produced faecal sludge emptied per year (scheduled desludging about every 3 years)
  biogas_capture: 0.5,         // share of WWTP treatment CH4 captured in scenario
};

function substages(r, prefix) { return r.substages.filter(s => s.prefix === prefix); }

const RULES = [
  {
    id: 'pump_upgrade',
    applies: r => ['wsa', 'wsd', 'wwc', 'wwo', 'wst', 'wwt'].flatMap(p => substages(r, p))
      .filter(s => {
        const eff = s.outputs[s.prefix + '_KPI_nrg_elec_eff'];
        const sav = s.outputs[s.prefix + '_KPI_nrg_estm_sav'];
        return eff > 0 && sav > 0;
      }),
    build: (s) => {
      const p = s.prefix, o = s.outputs;
      return {
        category: 'energy',
        title: { en: `Upgrade pump system – ${s.name}`, id: `Peningkatan sistem pompa – ${s.name}` },
        expected_kwh: o[p + '_KPI_nrg_estm_sav'],
        expected_kgco2: o[p + '_KPI_ghg_estm_red'],
        evidence: {
          en: `Measured electromechanical efficiency is ${fmt(o[p + '_KPI_nrg_elec_eff'], 1)}% against an expected ${fmt(s.inputs?.[p + '_pmp_exff'], 0)}%.`,
          id: `Efisiensi elektromekanis terukur ${fmt(o[p + '_KPI_nrg_elec_eff'], 1)}% dibandingkan target ${fmt(s.inputs?.[p + '_pmp_exff'], 0)}%.`,
        },
        basis: `ECAM ${p}_KPI_nrg_estm_sav and ${p}_KPI_ghg_estm_red`,
        condition: { en: 'Duty-point test and design review', id: 'Uji titik kerja dan tinjauan desain' },
      };
    },
  },
  {
    id: 'pump_audit',
    applies: r => ['wsa', 'wsd', 'wwc'].flatMap(p => substages(r, p))
      .filter(s => s.energy_kwh > 0 && !(s.outputs[s.prefix + '_KPI_nrg_elec_eff'] > 0)),
    build: (s, r) => ({
      category: 'energy',
      title: { en: `Verify pump performance – ${s.name}`, id: `Verifikasi kinerja pompa – ${s.name}` },
      expected_kwh: null, expected_kgco2: null,
      expected_text: { en: 'Evidence for a decision', id: 'Bukti untuk pengambilan keputusan' },
      evidence: {
        en: `${fmt(s.energy_kwh)} kWh grid electricity (${fmt(100 * s.energy_kwh / r.energy_kwh, 0)}% of the utility total) but no pump efficiency data yet.`,
        id: `${fmt(s.energy_kwh)} kWh listrik PLN (${fmt(100 * s.energy_kwh / r.energy_kwh, 0)}% dari total) tetapi belum ada data efisiensi pompa.`,
      },
      basis: 'ECAM energy inputs; pump-efficiency questions not answered',
      condition: { en: 'Audit scope and cost', id: 'Lingkup dan biaya audit' },
    }),
  },
  {
    id: 'nrw_reduction',
    applies: r => substages(r, 'wsd').filter(s => s.inputs?.wsd_vol_dist > 0 && s.inputs?.wsd_auth_con > 0
      && (1 - s.inputs.wsd_auth_con / s.inputs.wsd_vol_dist) > 0.15),
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
        title: { en: `Reduce non-revenue water – ${s.name}`, id: `Penurunan air tak berekening – ${s.name}` },
        expected_kwh: kwh, expected_kgco2: kwh * r.factors.conv_kwh_co2,
        scenario: {
          en: `Scenario: NRW cut by ${ASSUMPTIONS.nrw_reduction_points} percentage points at ${fmt(kwhPerM3, 2)} kWh/m³`,
          id: `Skenario: ATR turun ${ASSUMPTIONS.nrw_reduction_points} poin persen pada ${fmt(kwhPerM3, 2)} kWh/m³`,
        },
        evidence: {
          en: `Non-revenue water is about ${fmt(100 * nrw, 0)}% (distributed ${fmt(i.wsd_vol_dist)} m³, authorized consumption ${fmt(i.wsd_auth_con)} m³).`,
          id: `Air tak berekening sekitar ${fmt(100 * nrw, 0)}% (didistribusikan ${fmt(i.wsd_vol_dist)} m³, konsumsi resmi ${fmt(i.wsd_auth_con)} m³).`,
        },
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
        scenario: {
          en: `ECAM re-run: ${ASSUMPTIONS.desludging_emptied_pct}% of faecal sludge emptied per year (now ${s.inputs?.wwo_cont_emp || 0}%). Emissions from treating the emptied sludge are not yet included.`,
          id: `Hitung ulang ECAM: ${ASSUMPTIONS.desludging_emptied_pct}% lumpur tinja dikuras per tahun (saat ini ${s.inputs?.wwo_cont_emp || 0}%). Emisi pengolahan lumpur yang dikuras belum termasuk.`,
        },
        evidence: {
          en: `Containment emits ${fmt(t(ghg))} tCO2eq, ${fmt(100 * ghg / r.totals.total, 0)}% of the utility total.`,
          id: `Penampungan menghasilkan ${fmt(t(ghg))} tCO2eq, ${fmt(100 * ghg / r.totals.total, 0)}% dari total.`,
        },
        basis: 'ECAM wwo_KPI_GHG_containment, re-run with Estimations.wwo_fslu_emp and wwo_bod_rmvd',
        condition: { en: 'Containment survey and IPLT (sludge treatment) capacity', id: 'Survei penampungan dan kapasitas IPLT' },
      };
    },
  },
  {
    id: 'cso_reduction',
    applies: r => substages(r, 'wwc').filter(s => (s.outputs.wwc_KPI_GHG_cso?.total || 0) > 0),
    build: (s, r) => {
      const ghg = s.outputs.wwc_KPI_GHG_cso.total;
      return {
        category: 'sanitation',
        title: { en: `Route untreated sewage to treatment – ${s.name}`, id: `Alirkan air limbah tak terolah ke pengolahan – ${s.name}` },
        expected_kwh: null, expected_kgco2: ghg,
        expected_text: { en: 'Up to the full untreated-discharge emission', id: 'Hingga seluruh emisi pembuangan tak terolah' },
        evidence: {
          en: `${fmt(s.inputs?.wwc_vol_coll_unt)} m³ collected wastewater is discharged untreated: ${fmt(t(ghg), 1)} tCO2eq.`,
          id: `${fmt(s.inputs?.wwc_vol_coll_unt)} m³ air limbah terkumpul dibuang tanpa pengolahan: ${fmt(t(ghg), 1)} tCO2eq.`,
        },
        basis: 'ECAM wwc_KPI_GHG_cso (upper bound; treatment emissions would partly replace it)',
        condition: { en: 'Hydraulic study and WWTP spare capacity', id: 'Studi hidrolika dan kapasitas cadangan IPAL' },
      };
    },
  },
  {
    id: 'biogas_capture',
    // only anaerobic processes (IPCC CH4 factor >= 0.1 kgCH4/kgBOD) have recoverable methane
    applies: r => substages(r, 'wwt').filter(s => (s.outputs.wwt_KPI_GHG_tre?.ch4 || 0) > 0 && s.inputs?.wwt_ch4_efac_tre >= 0.1),
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
          id: `Proses pengolahan mengemisikan ${fmt(t(ch4), 1)} tCO2eq sebagai CH4.`,
        },
        basis: 'ECAM wwt_KPI_GHG_tre (CH4)',
        condition: { en: 'Biogas yield test and gas-use options', id: 'Uji hasil biogas dan opsi pemanfaatan gas' },
      };
    },
  },
  {
    id: 'fuel_switch',
    applies: r => r.substages.filter(s => (s.outputs[s.prefix + '_KPI_GHG_fuel']?.total || 0) > 0),
    build: (s) => {
      const ghg = s.outputs[s.prefix + '_KPI_GHG_fuel'].total;
      return {
        category: 'energy',
        title: { en: `Reduce diesel use in engines – ${s.name}`, id: `Kurangi penggunaan solar pada genset – ${s.name}` },
        expected_kwh: null, expected_kgco2: null,
        expected_text: { en: `Benefit not yet calculated (fuel emits ${fmt(t(ghg), 1)} tCO2eq)`, id: `Manfaat belum dihitung (bahan bakar ${fmt(t(ghg), 1)} tCO2eq)` },
        evidence: { en: `On-site engines emit ${fmt(t(ghg), 1)} tCO2eq.`, id: `Mesin di lokasi mengemisikan ${fmt(t(ghg), 1)} tCO2eq.` },
        basis: `ECAM ${s.prefix}_KPI_GHG_fuel`,
        condition: { en: 'Generator run-hours log and grid reliability', id: 'Catatan jam operasi genset dan keandalan listrik' },
      };
    },
  },
  {
    id: 'solar_pv',
    applies: r => r.energy_kwh > 0 ? [r] : [],
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
          id: `Utilitas memakai ${fmt(r.energy_kwh)} kWh listrik PLN dengan faktor ${r.factors.conv_kwh_co2} kgCO2/kWh.`,
        },
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
function suggestActions(results, assessment, engine, gwpIndex = 0) {
  const ctx = { assessment, engine, gwpIndex };
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
    expected_kwh: 0, expected_kgco2: 0,
    evidence: {
      en: `Baseline: ${fmt(t(results.totals.total))} tCO2eq and ${fmt(results.energy_kwh)} kWh over ${fmt(results.period.days)} days.`,
      id: `Garis dasar: ${fmt(t(results.totals.total))} tCO2eq dan ${fmt(results.energy_kwh)} kWh selama ${fmt(results.period.days)} hari.`,
    },
    basis: 'ECAM TotalGHG, TotalNRG',
    condition: { en: 'No claimed saving', id: 'Tidak ada klaim penghematan' },
  }];
  for (const rule of RULES) {
    for (const m of rule.applies(results)) {
      options.push({ rule: rule.id, ...rule.build(m, results, ctx), substage: where.get(m) || null });
    }
  }
  options.forEach((o, k) => { if (!o.id) o.id = 'A' + String(k).padStart(2, '0'); });
  // largest calculated reductions first, keeping the baseline on top
  const [base, ...rest] = options;
  rest.sort((a, b) => (b.expected_kgco2 || 0) - (a.expected_kgco2 || 0));
  rest.forEach((o, k) => { o.id = 'A' + String(k + 1).padStart(2, '0'); });
  return { assumptions: ASSUMPTIONS, options: [base, ...rest] };
}

module.exports = { suggestActions, ASSUMPTIONS };
