/*
 * Comprehensive worked example: Perumda Tirtawening Kota Bandung (water supply + sewer + Bojongsoang ponds).
 * Source: team document "ChatWater Tirtawening Bandung Stages 1 to 4 Worked Example" (Oct 30, 2026), which labels
 * every input as Reported, Derived, Proxy or Assumed. It is a demonstration built from public data and explicit
 * assumptions, not a verified emissions inventory, an approved investment or evidence of utility endorsement.
 * Only the "complete example" button uses this; real imports never call it. Shared by the browser (global DemoBandung) and tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cw-core'), require('./preliminary-concept'));
  else root.DemoBandung = factory(root.CW, root.PC);
})(typeof self !== 'undefined' ? self : this, function (CW, PC) {
  const NOTE = {
    en: 'DEMO worked example (team document, Oct 2026): 2023 Tirtawening water indicators, historical 2019 Bojongsoang proxies and labelled assumptions (R reported, D derived, P proxy, A assumed). Not a verified inventory, an approved project or utility endorsement.',
    id: 'Contoh DEMO (dokumen tim, Okt 2026): indikator air Tirtawening 2023, proksi historis Bojongsoang 2019 dan asumsi berlabel (R dilaporkan, D turunan, P proksi, A asumsi). Bukan inventaris terverifikasi, proyek yang disetujui, atau dukungan PDAM.',
  };
  // Basis of each input, as labelled in the team document
  const BASIS = {
    ws_resi_pop: 'R', wsd_serv_pop: 'R', wsd_bill_con: 'P', wsd_vol_dist: 'D+P', wsd_auth_con: 'D+A',
    wsa_vol_conv: 'A', wsa_nrg_cons: 'A', wst_vol_trea: 'A', wst_nrg_cons: 'A', wsd_nrg_cons: 'A',
    ww_resi_pop: 'R', wwc_conn_pop: 'A', wwc_vol_coll: 'D+P 2019', wwc_vol_coll_unt: 'A (test only)', wwc_vol_coll_tre: 'D+P+A', wwc_bod: 'D+P 2019', wwc_tn: 'A (20 mg/L)', wwc_nrg_cons: 'A',
    wwt_serv_pop: 'A', wwt_vol_trea: 'D+P', wwt_vol_disc: 'A (closed flow)', wwt_bod_infl: 'D+P', wwt_bod_effl: 'A (25 mg/L)', wwt_tn_infl: 'A (20 mg/L)', wwt_tn_effl: 'A (12 mg/L)',
    wwt_nrg_cons: 'A', wwt_mass_slu: 'A', wwt_bod_slud: 'A', wwt_ch4_efac_tre: 'P (deep pond)', wwt_n2o_efac_tre: 'P (anaerobic)',
  };

  function build(a, meta, lang = 'en') {
    const L = lang === 'id' ? 'id' : 'en', note = NOTE[L];
    const profile = {
      name: 'DEMO | Perumda Tirtawening Kota Bandung', country: 'Indonesia',
      location: L === 'id' ? 'Kota Bandung, Jawa Barat (IPAL Bojongsoang di Kabupaten Bandung)' : 'Kota Bandung, West Java (Bojongsoang WWTP in Kabupaten Bandung)',
      service_type: 'both', population: '2569107', served: '965283',
      resp_water_supply: 'operates', resp_sewer: 'operates', resp_wwtp: 'operates', resp_onsite: 'none', resp_fs: '',
      capex: 'partial', tech_capacity: 'some', data_availability: 'partial',
      notes: L === 'id'
        ? 'Debit air baku Cikalong turun pada musim kemarau 2026 dan mengganggu distribusi; banjir dilaporkan di sekitar Bojongsoang (Feb 2025). NRW 39,42% (2023). Ada kontrak NRW berbasis kinerja di wilayah utara; hindari tumpang tindih. ' + note
        : 'Lower Cikalong raw-water flow disrupted distribution in the 2026 dry season; flooding reported around Bojongsoang (Feb 2025). NRW 39.42% (2023). An existing performance-based NRW contract covers the northern area; avoid overlap. ' + note,
    };
    const record = { origin: 'imported', s: {}, provenance: note };
    const track = (obj, sid) => record.s[sid] = Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => [k, { o: 'imported', c: true, v, source_note: BASIS[k] ? `${BASIS[k]} · ${note}` : note }]));
    track(a.General, 'General'); track(a.Water, 'Water'); track(a.Waste, 'Waste');
    for (const [p, lv, sl] of CW.STAGE_KEYS) a[lv][sl].forEach((x, i) => track(x, meta.substages[p][i]));

    const sid = p => (meta.substages[p] || [])[0] || null;
    const T = L === 'id' ? {
      projectTitle: 'Percontohan Pengurangan Kehilangan Air dan Keandalan Air Limbah Bandung',
      location: 'Kota Bandung, Jawa Barat, Indonesia; pekerjaan pengolahan air limbah di Bojongsoang, Kabupaten Bandung. Batas DMA, saluran dan aset dipastikan saat persiapan.',
      organization: 'Perumda Tirtawening Kota Bandung (pelaksana ilustratif; partisipasi dan kewenangan pengajuan belum dikonfirmasi).',
      objective: 'Meningkatkan kontinuitas layanan air saat kemarau dan keandalan air limbah saat musim hujan, mengurangi kehilangan fisik dan pemakaian energi, serta membangun dasar terukur untuk investasi air limbah rendah emisi.',
      climateProblem: 'Debit air baku Cikalong yang menurun mengganggu layanan pada kemarau 2026; banjir terjadi di sekitar Bojongsoang. Ini menunjukkan kerentanan; proyeksi per aset, elevasi banjir dan dampak layanan masih perlu dikaji dengan data lokal dan skenario BMKG.',
      investmentNeed: 'Paket ilustratif IDR 10 miliar: meteran, tiga percontohan DMA, diagnostik dan rehabilitasi pompa terbatas, kendali keandalan Bojongsoang, pembaruan RPAM, dan hingga 400 sambungan saluran bersyarat. Rekonstruksi kolam besar dan penangkapan metana tidak termasuk.',
      beneficiaries: 'Lingkup langsung sekitar 3.000 sambungan air di tiga DMA dan hingga 400 sambungan saluran baru (asumsi). Rumah tangga, kelompok rentan dan tumpang tindih akan diverifikasi.',
      purpose: 'both',
      adaptationEvidence: 'Pemberitahuan Tirtawening (2 Sep 2026) tentang debit Cikalong dan laporan banjir Bojongsoang (Feb 2025) sebagai pengamatan. Uji tekanan ilustratif: penurunan debit 20% selama 30 hari dan pemadaman listrik 6 jam (bukan prakiraan).',
      duration: '104 minggu sejak pendanaan dan izin dikonfirmasi (sekitar 24 bulan).',
      totalCost: 'IDR 10.000.000.000 investasi ilustratif, termasuk kontingensi IDR 1.000.000.000; biaya operasi tambahan IDR 300.000.000 per tahun setelah komisioning.',
      financingSource: 'Campuran ilustratif: IDR 2 miliar dana PDAM, IDR 3 miliar dukungan publik daerah/nasional, IDR 5 miliar dukungan eksternal. Belum ada yang berkomitmen.',
      partners: 'Peran usulan saja: Tirtawening, Kota Bandung, Kabupaten Bandung, otoritas sumber daya air dan lingkungan, BMKG, masyarakat dan penasihat spesialis.',
      assumptions: 'Lokasi, kuantitas, biaya, target dan porsi pendanaan bersifat sementara. Proksi air limbah 2019 dan energi asumsi tidak dapat mendukung klaim pendanaan atau GRK final.',
    } : {
      projectTitle: 'Bandung Water-Loss and Wastewater Reliability Pilot',
      location: 'Kota Bandung, West Java, Indonesia, with wastewater-treatment works at Bojongsoang in Kabupaten Bandung. Exact DMA, sewer and asset boundaries will be confirmed during preparation.',
      organization: 'Perumda Tirtawening Kota Bandung is the illustrative implementing utility. Utility participation and submission authority have not been confirmed.',
      objective: 'Improve dry-season water-service continuity and wet-weather wastewater reliability, reduce avoidable physical losses and energy use, and build a measured basis for future low-emission wastewater investment.',
      climateProblem: 'Lower raw-water flow at Cikalong disrupted service during the 2026 dry season. Local flooding has occurred around Bojongsoang. These observations identify vulnerabilities; asset-specific projections, flood levels and service consequences still need study using local observations and BMKG scenarios.',
      investmentNeed: 'An illustrative IDR 10 billion package for metering, three DMA pilots, pump diagnostics and limited rehabilitation, Bojongsoang reliability controls, RPAM updating and up to 400 conditional sewer connections. Major pond reconstruction and methane-capture construction are excluded.',
      beneficiaries: 'Assumed direct scope of about 3,000 existing water connections in three DMAs and up to 400 new sewer connections. Households, vulnerable groups and overlap will be verified.',
      purpose: 'both',
      adaptationEvidence: "Tirtawening's 2 Sep 2026 Cikalong source-flow notice and the Feb 2025 Bojongsoang flood report as observations. A 20% source-yield reduction for 30 days and a 6-hour power outage are illustrative stress tests, not forecasts.",
      duration: '104 weeks from confirmed funding and authorization (about 24 months).',
      totalCost: 'IDR 10,000,000,000 illustrative investment, including IDR 1,000,000,000 contingency; additional operating allowance IDR 300,000,000 per year after commissioning.',
      financingSource: 'Illustrative mix: IDR 2 billion utility funds, IDR 3 billion local/national public support and IDR 5 billion external support. None is committed.',
      partners: 'Proposed roles only: Tirtawening, Kota Bandung, Kabupaten Bandung, water-resources and environmental authorities, BMKG/data providers, communities and specialist advisers.',
      assumptions: 'All sites, scope quantities, costs, targets and funding shares are provisional. Historical 2019 wastewater proxies and assumed energy values cannot support a final funding or GHG claim.',
    };
    const financing = { route: PC.ROUTE, pathways: ['gcf'], conceptInputs: T };

    const custom = (L === 'id' ? [
      ['Penilaian keandalan dan risiko iklim Bojongsoang', 'Verifikasi meteran masuk/keluar dan energi pompa, sampel BOD dan nitrogen total, survei lumpur dan kondisi hidraulik kolam, pemetaan paparan banjir dan uji cadangan listrik; susun desain rehabilitasi prioritas dan keputusan kelayakan penangkapan metana terpisah.', 'Catatan debit historis tidak menutup neraca air; beban, energi, bypass dan kinerja kolam saat ini perlu diverifikasi sebelum ekspansi atau klaim pengurangan emisi.', 'wwt'],
      ['Pembaruan RPAM tangguh iklim dan kontinuitas layanan', 'Perbarui RPAM dengan risiko debit kemarau dan kualitas air saat hujan, pemantauan tekanan dan kontinuitas, komunikasi darurat, dukungan pengguna prioritas dan latihan staf; sertakan prosedur banjir dan pemadaman listrik untuk air limbah.', 'Gangguan debit air baku dan paparan banjir menimbulkan risiko layanan; data iklim per aset belum lengkap.', null],
      ['Percontohan bersyarat 400 sambungan saluran', 'Survei daerah layanan bersaluran dan kembangkan 400 sambungan usulan; konstruksi hanya setelah pemeriksaan kapasitas dan efluen, desain jaringan, persetujuan, keterjangkauan dan pendanaan.', 'Sebagian rumah tangga belum tersambung meski sambungan layak; lokasi dan penerima manfaat belum dikonfirmasi.', 'wwc'],
    ] : [
      ['Bojongsoang reliability and climate-risk assessment', 'Verify inlet/outlet meters and pump energy, sample BOD and total nitrogen, survey pond sludge and hydraulic condition, map flood exposure and test emergency power; prepare a prioritized rehabilitation design and a separate methane-capture feasibility decision.', 'Historical flow records do not close the water balance. Current loads, energy, bypasses and pond performance need verification before expansion or emissions-reduction claims.', 'wwt'],
      ['Climate-resilient RPAM and service-continuity update', 'Update the existing RPAM with dry-season source-yield and wet-weather water-quality risks, pressure and continuity monitoring, emergency communication, priority-user support and staff drills, with a linked wastewater flood and power-loss procedure.', 'Recent source-flow disruption and local flood exposure create plausible service risks; asset-specific climate and consequence data are incomplete.', null],
      ['Conditional pilot of 400 sewer connections', 'Survey an eligible sewered catchment and develop 400 proposed connections. Construction proceeds only after treatment-capacity and effluent checks, network design, consent, affordability support and funding approval.', 'Some households remain unconnected where a feasible connection exists; eligible sites and beneficiaries are not yet confirmed.', 'wwc'],
    ]).map(([title, description, problem, p]) => ({ title, description, problem, location: p && sid(p) ? { at: 'substage', prefix: p, sid: sid(p) } : { at: 'assessment' } }));
    return { profile, record, financing, custom };
  }
  return { build, BASIS, NOTE };
});
