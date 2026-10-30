/*
 * Stage 3 — project concept in the eight areas of the team's planning framework
 * (frameworks/stage-guidance.json, stage3; meeting feedback: "use standardized planning
 * frameworks, highlight missing data, allow users to edit before finalization").
 *
 * Every area is first filled from data the app already has (ECAM results, selected actions,
 * tasks, profile). What the app cannot know is written as a [To be provided: …] placeholder,
 * so gaps are visible instead of guessed. With AI on, the model rewrites the areas from the
 * same data and the library, keeping placeholders for anything it cannot support.
 */
const GUIDE = require('../frameworks/stage-guidance.json');
const RS = require('../public/js/responsibility');
const CW = require('../public/js/cw-core');
const R = require('./retrieval');
const { callClaude, aiEnabled, parseJson } = require('./ai');

const TITLES_ID = ['Menetapkan proyek', 'Menetapkan garis dasar', 'Mengidentifikasi kegiatan proyek', 'Menetapkan penanggung jawab',
  'Menyusun jadwal pelaksanaan', 'Menetapkan persyaratan teknis dan operasional', 'Menilai risiko pelaksanaan', 'Menetapkan pemantauan dan evaluasi'];
// Indonesian wording of the framework's area descriptions and questions (stage-guidance.json stage3), awaiting Silvia's review.
const GUIDE_ID = [
  { description: 'Tujuan, lingkup, dan hasil yang diharapkan' },
  { description: 'Kinerja saat ini dan buktinya', questions: [
    'Berapa tingkat emisi, konsumsi energi, atau gangguan layanan saat ini?',
    'Bahaya iklim apa yang memengaruhi lokasi proyek?',
    'Data garis dasar apa yang tersedia, dan kajian tambahan apa yang diperlukan?',
    'Bagaimana utilitas akan mengukur perbaikan terhadap garis dasar?'] },
  { description: 'Menjabarkan kegiatan terpilih menjadi paket pekerjaan', questions: [
    'Kegiatan apa saja yang diperlukan untuk melaksanakan kegiatan terpilih?',
    'Penyelidikan teknis, desain, izin, atau persetujuan apa yang diperlukan?',
    'Apa tonggak capaian utama pelaksanaan?',
    'Apa yang harus selesai sebelum pelaksanaan dapat dimulai?'] },
  { description: 'Orang, unit kerja, dan mitra eksternal' },
  { description: 'Waktu, urutan, dan keterkaitan antartugas' },
  { description: 'Kelayakan dan kontinuitas layanan' },
  { description: 'Risiko pelaksanaan dan ketahanan pada kondisi mendatang' },
  { description: 'Target, indikator, dan akuntabilitas' },
];
const fmt = (n, d = 0) => (n == null || !Number.isFinite(n)) ? '–' : n.toLocaleString('en-US', { maximumFractionDigits: d });
const fmtId = (n, d = 0) => CW.formatNumber(n, 'id', d);

// Indicators that ECAM can track for each rule when the assessment is repeated
const INDICATORS = {
  pump_upgrade: { en: 'electromechanical pump efficiency (%) and energy per m³ pumped', id: 'efisiensi elektromekanis pompa (%) dan energi per m³ yang dipompa' },
  pump_audit: { en: 'pump duty-point measurements entered in ECAM', id: 'hasil pengukuran titik kerja pompa yang diisi di ECAM' },
  nrw_reduction: { en: 'water distributed vs. authorized and billed consumption (m³)', id: 'air yang didistribusikan dibandingkan konsumsi resmi dan berekening (m³)' },
  septic_desludging: { en: 'share of faecal sludge emptied (%) and containment methane (tCO₂eq)', id: 'porsi lumpur tinja yang dikuras (%) dan metana penampungan (tCO₂eq)' },
  cso_reduction: { en: 'collected wastewater discharged untreated (m³)', id: 'air limbah terkumpul yang dibuang tanpa pengolahan (m³)' },
  biogas_capture: { en: 'treatment-process methane (tCO₂eq) and biogas captured', id: 'metana proses pengolahan (tCO₂eq) dan biogas yang ditangkap' },
  fuel_switch: { en: 'fuel used by on-site engines (L)', id: 'bahan bakar mesin di lokasi (L)' },
  solar_pv: { en: 'grid electricity used (kWh) and solar electricity generated (kWh)', id: 'listrik jaringan yang dipakai (kWh) dan listrik surya yang dihasilkan (kWh)' },
};

const T = {
  en: {
    tbp: x => `[To be provided: ${x}]`,
    purpose: (u, n) => `Purpose: carry out ${n} selected action(s) at ${u}, to reduce emissions and energy use where the utility can act.`,
    scope: 'Scope:', outcome: 'Expected outcome (each estimate on its own; they are not added up):', notq: 'benefit not quantified',
    objective: 'project objective agreed with management',
    baseline: r => `ECAM ${CW.formatDate(r.period.start, 'en')} – ${CW.formatDate(r.period.end, 'en')}: ${fmt(r.total_tco2eq)} tCO₂eq and ${fmt(r.energy_kwh)} kWh of grid electricity (${CW.gwpLabel(r.gwp_report, 'en')}; grid factor ${r.grid_factor_kgco2_per_kwh} kgCO₂/kWh).`,
    split: (d, c, o, tot) => `Of the ${fmt(tot)} tCO₂eq inventory, ${fmt(d)} t are within the utility's direct responsibility, ${fmt(c)} t need coordination and ${fmt(o)} t are outside its responsibility.`,
    est: n => `${n} input(s) use ECAM estimates instead of measured data; the baseline is indicative until they are replaced.`,
    hazards: 'climate hazards affecting the project location', addData: 'additional data or assessments needed',
    notes: n => `Notes from the utility profile: ${n}`,
    acts: 'Work packages per action (from the plan):', permits: 'permits and approvals needed, and who issues them',
    owners: 'Task owners (defaults, edit in the task table):', coord: ids => `Coordination needed for ${ids}: `, coordWho: 'the agency or provider to coordinate with',
    outside: ids => `${ids} concern(s) a service outside the utility's responsibility; the utility's role is to coordinate.`, staff: 'named staff and departments',
    sched: w => `Overall duration about ${w} weeks.`, perAct: (id, a, b) => `${id}: weeks ${a}–${b}`, generic: 'Durations are generic defaults.', procurement: 'durations confirmed against the utility\'s procurement and approval rules',
    cond: 'Decision conditions to meet before implementation:', continuity: 'how service continuity is kept during the works',
    risks: 'Risks identified from the profile and selection:', rFin: 'Financing is not yet secured (external financing needed).', rCo: 'Co-financing still needs to be found.',
    rTech: 'Technical capacity is limited; specialist support may be needed.', rData: 'Estimates rest mostly on estimated data.', rCoord: 'Depends on decisions by other organisations.',
    riskMore: 'climate and delivery risks, and how they will be managed',
    me: 'Repeat the ECAM assessment each year with measured data and compare it with this baseline.', ind: 'Indicators ECAM can track:', targets: 'targets and who reports them',
  },
  id: {
    tbp: x => `[Perlu disediakan: ${x}]`,
    purpose: (u, n) => `Tujuan: melaksanakan ${n} kegiatan terpilih di ${u}, untuk mengurangi emisi dan pemakaian energi pada bagian yang dapat ditangani utilitas.`,
    scope: 'Lingkup:', outcome: 'Hasil yang diharapkan (setiap perkiraan berdiri sendiri; tidak dijumlahkan):', notq: 'manfaat belum dihitung',
    objective: 'tujuan proyek yang disepakati manajemen',
    baseline: r => `ECAM ${CW.formatDate(r.period.start, 'id')} – ${CW.formatDate(r.period.end, 'id')}: ${fmtId(r.total_tco2eq)} tCO₂eq dan ${fmtId(r.energy_kwh)} kWh listrik jaringan (${CW.gwpLabel(r.gwp_report, 'id')}; faktor jaringan ${fmtId(r.grid_factor_kgco2_per_kwh, 3)} kgCO₂/kWh).`,
    split: (d, c, o, tot) => `Dari inventaris ${fmtId(tot)} tCO₂eq, ${fmtId(d)} t berada dalam tanggung jawab langsung utilitas, ${fmtId(c)} t perlu koordinasi, dan ${fmtId(o)} t di luar tanggung jawabnya.`,
    est: n => `${n} masukan memakai perkiraan ECAM, bukan data terukur; garis dasar bersifat indikatif sampai diganti.`,
    hazards: 'bahaya iklim yang memengaruhi lokasi proyek', addData: 'data atau kajian tambahan yang diperlukan',
    notes: n => `Catatan dari profil utilitas: ${n}`,
    acts: 'Paket pekerjaan per kegiatan (dari rencana):', permits: 'izin dan persetujuan yang diperlukan, serta penerbitnya',
    owners: 'Penanggung jawab tugas (bawaan, ubah di tabel tugas):', coord: ids => `Perlu koordinasi untuk ${ids}: `, coordWho: 'dinas atau penyedia yang perlu diajak berkoordinasi',
    outside: ids => `${ids} menyangkut layanan di luar tanggung jawab utilitas; peran utilitas adalah berkoordinasi.`, staff: 'nama staf dan unit kerja',
    sched: w => `Durasi keseluruhan sekitar ${w} minggu.`, perAct: (id, a, b) => `${id}: minggu ${a}–${b}`, generic: 'Durasi adalah nilai bawaan umum.', procurement: 'durasi yang dicek terhadap aturan pengadaan dan persetujuan utilitas',
    cond: 'Syarat keputusan yang harus dipenuhi sebelum pelaksanaan:', continuity: 'cara menjaga kontinuitas layanan selama pekerjaan',
    risks: 'Risiko dari profil dan pilihan kegiatan:', rFin: 'Pembiayaan belum tersedia (perlu pembiayaan eksternal).', rCo: 'Pendanaan pendamping masih perlu dicari.',
    rTech: 'Kapasitas teknis terbatas; mungkin perlu dukungan ahli.', rData: 'Perkiraan sebagian besar berdasarkan data perkiraan.', rCoord: 'Bergantung pada keputusan organisasi lain.',
    riskMore: 'risiko iklim dan pelaksanaan, serta cara pengelolaannya',
    me: 'Ulangi penilaian ECAM setiap tahun dengan data terukur dan bandingkan dengan garis dasar ini.', ind: 'Indikator yang dapat dipantau ECAM:', targets: 'target dan siapa yang melaporkannya',
  },
};

const isUser = a => typeof a.origin === 'string' && a.origin.startsWith('user');

/**
 * input: { facts (proposal.facts), actions (selected, raw), plan ({ tasks, total_weeks }), profile, breakdown (RS.breakdown or null),
 *          estimates (count of inputs using ECAM estimates), lang }
 * Returns areas: [{ n, id, title, text, status: 'data' | 'template' }]
 */
function template({ facts: f, actions = [], plan, profile, breakdown, estimates = 0, lang = 'en' }) {
  const x = T[lang] || T.en;
  const sel = (f.selected_actions || []).filter(a => a.id !== 'A00');
  const raw = new Map(actions.map(a => [a.id, a]));
  // utility name with its location from the Home page details (workflow, Oct 29)
  const utility = ((profile && profile.name) || (f.ecam_results && f.ecam_results.assessment) || '') + (profile && profile.name && profile.location ? ` (${profile.location})` : '');
  const tier = a => (RS.forOption(raw.get(a.id), profile) || {}).tier;
  const lines = (...l) => l.filter(Boolean).join('\n');
  const list = items => items.filter(Boolean).map(s => `- ${s}`).join('\n');
  const tasks = (plan && plan.tasks) || [];

  const areas = [];
  // 1 define
  areas.push(lines(
    x.purpose(utility, sel.length),
    x.scope, list(sel.map(a => `${a.id} ${a.title}${a.location ? ` (${a.location})` : ''}`)),
    x.outcome, list(sel.map(a => `${a.id}: ${a.expected_tco2eq != null || a.expected_kwh != null ? a.expected : x.notq}`)),
    x.tbp(x.objective)));
  // 2 baseline
  const b = breakdown && breakdown.total > 0 ? breakdown : null;
  areas.push(lines(
    f.ecam_results ? x.baseline(f.ecam_results) : null,
    b ? x.split(b.byTier.direct / 1000, b.byTier.conditional / 1000, b.byTier.outside / 1000, b.total / 1000) : null,
    estimates ? x.est(estimates) : null,
    profile && profile.notes ? x.notes(profile.notes) : null,
    x.tbp(x.hazards), x.tbp(x.addData)));
  // 3 activities
  areas.push(lines(x.acts, list(sel.map(a => {
    const names = tasks.filter(t => t.action_id === a.id).map(t => t.name);
    return names.length ? `${a.id}: ${names.join(' → ')}` : null;
  })), x.tbp(x.permits)));
  // 4 responsibilities
  const owners = [...new Set(tasks.map(t => t.owner).filter(Boolean))];
  const cond = sel.filter(a => tier(a) === 'conditional').map(a => a.id);
  const out = sel.filter(a => tier(a) === 'outside').map(a => a.id);
  areas.push(lines(x.owners, list(owners), cond.length ? x.coord(cond.join(', ')) + x.tbp(x.coordWho) : null,
    out.length ? x.outside(out.join(', ')) : null, x.tbp(x.staff)));
  // 5 schedule
  const span = id => { const ts = tasks.filter(t => t.action_id === id); return ts.length ? [Math.min(...ts.map(t => t.start_week)), Math.max(...ts.map(t => t.start_week + t.weeks))] : null; };
  areas.push(lines(plan ? x.sched(plan.total_weeks) : null, list(sel.map(a => { const s = span(a.id); return s ? x.perAct(a.id, s[0], s[1]) : null; })),
    x.generic, x.tbp(x.procurement)));
  // 6 technical and operational
  areas.push(lines(x.cond, list(sel.map(a => `${a.id}: ${a.decision_condition || (isUser(a) ? a.description : '')}`)), x.tbp(x.continuity)));
  // 7 risks
  const fl = new Set(actions.flatMap(a => RS.flags(a, profile)));
  const risks = [fl.has('needs_external_finance') ? x.rFin : null, fl.has('needs_cofinance') ? x.rCo : null, fl.has('needs_technical_support') ? x.rTech : null,
    fl.has('data_mostly_estimated') ? x.rData : null, cond.length || out.length ? x.rCoord : null].filter(Boolean);
  areas.push(lines(risks.length ? x.risks : null, list(risks), x.tbp(x.riskMore)));
  // 8 monitoring
  const ind = sel.map(a => { const r = raw.get(a.id); const i = r && INDICATORS[r.rule]; return i ? `${a.id}: ${i[lang] || i.en}` : null; });
  areas.push(lines(x.me, ind.some(Boolean) ? x.ind : null, list(ind), x.tbp(x.targets)));

  const idText = i => (lang === 'id' && GUIDE_ID[i]) || {};
  return GUIDE.stage3.map((g, i) => ({
    n: g.n, id: g.id, title: lang === 'id' ? TITLES_ID[i] : g.title,
    description: idText(i).description || g.description, questions: idText(i).questions || g.questions || [],
    text: areas[i] || x.tbp(g.description), status: /\[(To be provided|Perlu disediakan)/.test(areas[i] || '') ? 'template' : 'data',
  }));
}

/** With AI on: rewrite the template areas from the same data and the library; keep placeholders it cannot fill. */
async function draft(input, { system, promptData, langName }) {
  const areas = template(input);
  if (!aiEnabled()) return { areas, ai: false };
  const r = R.search(R.forPlan(input.facts));
  const content = `Rewrite the eight areas of this project concept in ${langName}. Keep every number exactly as in DATA, keep each action's estimate separate, `
    + 'and keep a [To be provided: …] placeholder wherever DATA and SOURCES do not support a statement. Cite document claims with [S#]. '
    + 'Each area: 40–140 words, plain text, short lists allowed. Reply with JSON only: {"areas":[{"n":1,"text":"…"}, … {"n":8,"text":"…"}]}'
    + `\n\nTEMPLATE (built from DATA):\n${JSON.stringify(areas.map(a => ({ n: a.n, title: a.title, framework_questions: a.questions, text: a.text })), null, 1)}`
    + promptData(input.facts, input.missing, r);
  const out = parseJson(await callClaude({ system, max_tokens: 2600, json: true, messages: [{ role: 'user', content }] }));
  const byN = new Map((out.areas || []).map(a => [Number(a.n), String(a.text || '').trim()]));
  const cit = R.citations([...byN.values()].join('\n'), r);
  const known = numberKeys(JSON.stringify(input.facts) + '\n' + areas.map(a => a.text).join('\n'));
  return {
    areas: areas.map(a => {
      const text = byN.get(a.n);
      if (!text) return a;
      const checks = checkArea(text, a.text, known, r);
      return { ...a, text, status: 'ai', ...(checks ? { checks } : {}) };
    }),
    ai: true, sources: cit.sources, evidence: R.evidenceRecord(r, cit),
  };
}

// Numbers next to letters (A01, tCO2eq, [S2]) are identifiers, not figures.
const NUMBER = /(?<![\p{L}\d.,])\d+(?:[.,]\d+)*(?![\p{L}\d])/gu;
const PLACEHOLDER = /\[(To be provided|To be completed|Perlu disediakan|Perlu dilengkapi)\s*:/gi;
/** Digits only, so "81,653.2" (en) and "81.653,2" (id) match the same figure. */
function numberKeys(text) {
  const keys = new Set();
  for (const m of String(text).replace(/\[S\d+\]/g, '').matchAll(NUMBER)) {
    keys.add(m[0].replace(/[.,]/g, ''));
    keys.add(m[0].split(/[.,]/)[0]);
  }
  return keys;
}

/**
 * What an AI-written area needs checking for: figures that are in neither DATA nor the template,
 * citation tags that match no retrieved passage, and placeholders the template had but the AI dropped.
 * Returns null when nothing needs checking.
 */
function checkArea(text, templateText, known, r) {
  const figures = [...new Set([...String(text).replace(/\[S\d+\]/g, '').matchAll(NUMBER)].map(m => m[0])
    .filter(n => { const k = n.replace(/[.,]/g, ''); return +k > 10 && !known.has(k); }))];
  const unknownTags = R.citations(text, r).unknown_tags;
  const dropped = (String(templateText).match(PLACEHOLDER) || []).length > (String(text).match(PLACEHOLDER) || []).length;
  const checks = {
    ...(figures.length ? { unsupported_figures: figures.slice(0, 10) } : {}),
    ...(unknownTags.length ? { unknown_tags: unknownTags } : {}),
    ...(dropped ? { placeholders_dropped: true } : {}),
  };
  return Object.keys(checks).length ? checks : null;
}

module.exports = { template, draft, INDICATORS, checkArea, numberKeys, TITLES_ID, GUIDE_ID };
