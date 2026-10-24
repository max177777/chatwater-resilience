/*
 * Indonesian wording for the English metadata that travels with library sources and the
 * team framework: role notes, review statuses, caveats, extraction notes, date notes and
 * locators (scripts/library/sources.json, engine/library.js). Shared by the browser (global SN),
 * the server and the exports.
 *
 * Text is matched exactly (or by the patterns below). Anything not listed is returned as
 * written with original: true, so the interface can mark it as original-language text
 * instead of presenting it as a translation. Source titles and quoted passages are never
 * passed through here.
 *
 * Indonesian wording awaits Silvia's review (docs/indonesian-review.md).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SN = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ROLE_NOTES = {
    'ChatWater team framework (draft, awaiting team review).': 'Kerangka kerja tim ChatWater (draf, menunggu tinjauan tim).',
    'Methodology reference.': 'Rujukan metodologi.',
    'External guidance.': 'Panduan eksternal.',
    'Regulatory text; current legal status not verified.': 'Teks peraturan; status hukum saat ini belum diverifikasi.',
    'Training material: illustrative, not facts about this utility.': 'Materi pelatihan: bersifat ilustrasi, bukan fakta tentang utilitas ini.',
    'Derived synthesis prepared from training decks; not scientifically reviewed.': 'Sintesis turunan yang disusun dari materi pelatihan; belum ditinjau secara ilmiah.',
  };
  const ID = {
    ...ROLE_NOTES,
    'Contains instruction-like wording; treated as quoted text only.': 'Berisi kalimat yang menyerupai instruksi; diperlakukan hanya sebagai kutipan.',
    // review statuses
    'Team working draft. Not externally reviewed. The links from Stage 2 rows to ECAM stages and emission sources were added by the ChatWater build and await team review.':
      'Draf kerja tim. Belum ditinjau pihak eksternal. Tautan dari baris Tahap 2 ke tahap ECAM dan sumber emisi ditambahkan oleh ChatWater dan menunggu tinjauan tim.',
    'Published methodology document. Not reviewed by the ChatWater team for this library.': 'Dokumen metodologi yang telah diterbitkan. Belum ditinjau tim ChatWater untuk pustaka ini.',
    'Published IPCC guideline. Not reviewed by the ChatWater team for this library.': 'Pedoman IPCC yang telah diterbitkan. Belum ditinjau tim ChatWater untuk pustaka ini.',
    'Consultation version as stated in the document. Not reviewed by the ChatWater team.': 'Versi konsultasi sebagaimana dinyatakan dalam dokumen. Belum ditinjau tim ChatWater.',
    'Published WHO guidance. Not reviewed by the ChatWater team for this library.': 'Panduan WHO yang telah diterbitkan. Belum ditinjau tim ChatWater untuk pustaka ini.',
    'Published World Bank report. Not reviewed by the ChatWater team for this library.': 'Laporan Bank Dunia yang telah diterbitkan. Belum ditinjau tim ChatWater untuk pustaka ini.',
    'Regulation text as supplied. Its current legal status (amended, replaced or in force) has not been verified.':
      'Teks peraturan sebagaimana diberikan. Status hukumnya saat ini (diubah, diganti, atau masih berlaku) belum diverifikasi.',
    'Scanned excerpt of an unidentified parent document. Text obtained by local OCR and not proofread.':
      'Kutipan hasil pindai dari dokumen induk yang belum teridentifikasi. Teks diperoleh dengan OCR lokal dan belum diperiksa ulang.',
    'Two-page summary document. Not reviewed by the ChatWater team.': 'Dokumen ringkasan dua halaman. Belum ditinjau tim ChatWater.',
    'Not reviewed by the ChatWater team.': 'Belum ditinjau tim ChatWater.',
    'Published country programme. Not reviewed by the ChatWater team.': 'Dokumen program negara yang telah diterbitkan. Belum ditinjau tim ChatWater.',
    'Derived synthesis. Not scientifically reviewed. Its qualifications (Appendix A) are attached to the passages they affect.':
      'Sintesis turunan. Belum ditinjau secara ilmiah. Catatan kualifikasinya (Lampiran A) dilampirkan pada bagian teks yang terdampak.',
    'Training slides. Not reviewed. See the qualifications recorded in the synthesis (ee-synthesis-en, Appendix A).':
      'Salindia pelatihan. Belum ditinjau. Lihat catatan kualifikasi dalam sintesis (ee-synthesis-en, Lampiran A).',
    'draft — not reviewed': 'draf — belum ditinjau',
    // caveats
    'Guides the questions to investigate and the actions to consider; it contains no quantitative criteria.':
      'Memandu pertanyaan yang perlu ditelusuri dan kegiatan yang dapat dipertimbangkan; tidak memuat kriteria kuantitatif.',
    "Written for national greenhouse gas inventories, not for a single utility's project accounting.":
      'Disusun untuk inventarisasi gas rumah kaca nasional, bukan untuk perhitungan proyek satu utilitas.',
    'Design guidance, not an eligibility decision. Current GCF requirements must be checked with GCF or the NDA.':
      'Panduan desain, bukan keputusan kelayakan. Persyaratan GCF yang berlaku harus diperiksa ke GCF atau NDA.',
    "Sanitation-focused (Part 3). The supplied file named 'Water' contains this same Part 3, not a separate water-supply part.":
      "Berfokus pada sanitasi (Bagian 3). Berkas bernama 'Water' yang diberikan berisi Bagian 3 yang sama, bukan bagian terpisah tentang penyediaan air minum.",
    'Despite the file name, this is Part 3 (sanitation). Passages that repeat the canonical copy are not indexed separately and never count as independent corroboration.':
      'Meskipun nama berkasnya demikian, ini adalah Bagian 3 (sanitasi). Bagian teks yang mengulang salinan utama tidak diindeks terpisah dan tidak pernah dihitung sebagai penguat yang independen.',
    'Regional focus is Latin America and the Caribbean; examples are not Indonesian evidence.':
      'Fokus wilayahnya Amerika Latin dan Karibia; contoh-contohnya bukan bukti untuk Indonesia.',
    'Do not infer that this regulation is currently in force; check the official legal database (JDIH PUPR / BPK).':
      'Jangan menyimpulkan bahwa peraturan ini masih berlaku; periksa basis data hukum resmi (JDIH PUPR / BPK).',
    'Parent document, year and legal status unknown; do not cite as current rules.':
      'Dokumen induk, tahun, dan status hukumnya tidak diketahui; jangan dikutip sebagai aturan yang berlaku.',
    'OCR text: list numbering and table layout are partly lost; check the original page before quoting.':
      'Teks OCR: penomoran daftar dan tata letak tabel sebagian hilang; periksa halaman aslinya sebelum mengutip.',
    'A summary flyer; it does not establish technology suitability or funding eligibility.':
      'Lembar ringkasan; tidak menetapkan kesesuaian teknologi maupun kelayakan pendanaan.',
    'Funding programmes, windows and criteria change; do not infer current eligibility from this document.':
      'Program, jendela pendanaan, dan kriteria dapat berubah; jangan menyimpulkan kelayakan saat ini dari dokumen ini.',
    'English and Indonesian versions are translations of each other and do not corroborate each other.':
      'Versi bahasa Inggris dan bahasa Indonesia merupakan terjemahan satu sama lain dan tidak saling menguatkan.',
    'Country priorities and pipelines date from 2021; they do not show current eligibility or funding availability.':
      'Prioritas dan daftar rencana proyek negara berasal dari 2021; tidak menunjukkan kelayakan atau ketersediaan dana saat ini.',
    'Training material: figures and cases are illustrations from the training, not facts about the current utility.':
      'Materi pelatihan: angka dan kasus adalah ilustrasi dari pelatihan, bukan fakta tentang utilitas ini.',
    'Illustrative training material, not facts about the current utility.': 'Materi pelatihan bersifat ilustrasi, bukan fakta tentang utilitas ini.',
    'Illustrative training material, not facts about the current utility. Named PDAM cases are examples only.':
      'Materi pelatihan bersifat ilustrasi, bukan fakta tentang utilitas ini. Kasus PDAM yang disebutkan hanyalah contoh.',
    'Text from local OCR; not proofread. Tables and list numbering are partly lost.': 'Teks dari OCR lokal; belum diperiksa ulang. Tabel dan penomoran daftar sebagian hilang.',
    'Slide text only; charts, images and diagrams are not extracted.': 'Hanya teks salindia; grafik, gambar, dan diagram tidak diekstrak.',
  };
  // already Indonesian in the curation file
  const SAME = new Set(['Program, jendela pendanaan dan kriteria dapat berubah; jangan menyimpulkan kelayakan saat ini dari dokumen ini.']);
  const QUALITY = { good: 'baik', fair: 'cukup', poor: 'buruk' };
  const decimal = s => s.replace(/(\d)\.(\d)/g, '$1,$2');
  const NOTE_PATTERNS = [
    [/^(\d+) table-of-contents segment\(s\) skipped\.$/, m => `${m[1]} segmen daftar isi dilewati.`],
    [/^(\d+) ligature glyphs repaired (.*)\.$/, m => `${m[1]} glif ligatur diperbaiki ${m[2]}.`],
    [/^(\d+) contact detail\(s\) redacted\.$/, m => `${m[1]} detail kontak disamarkan.`],
    [/^Repeated headers\/footers removed \(e\.g\. (.*)\)\.$/, m => `Header/footer berulang dihapus (mis. ${m[1]}).`],
    [/^Word spacing is broken in places \(([\d.]+)% single-letter tokens\); some words split\.$/, m => `Spasi antarkata rusak di beberapa tempat (${decimal(m[1])}% token satu huruf); sebagian kata terpecah.`],
  ];

  function note(text) {
    if (ID[text]) return ID[text];
    for (const [re, f] of NOTE_PATTERNS) { const m = text.match(re); if (m) return f(m); }
    return null;
  }

  /** { text, original }: the Indonesian wording, or the text as written with original: true. */
  function localize(text, lang) {
    const s = String(text == null ? '' : text);
    if (lang !== 'id' || !s || SAME.has(s)) return { text: s, original: false };
    const direct = note(s);
    if (direct) return { text: direct, original: false };
    const q = s.match(/^Extraction quality: (\w+)\.\s*(.*)$/);
    if (q && QUALITY[q[1]]) {
      const rest = q[2] ? note(q[2]) : '';
      if (rest != null) return { text: `Kualitas ekstraksi teks: ${QUALITY[q[1]]}.${rest ? ' ' + rest : ''}`, original: false };
    }
    return { text: s, original: true };
  }

  const DATE_PARTS = [
    ['last modified, from document properties', 'terakhir diubah, menurut properti dokumen'],
    ['described in the document as the final report for consultation', 'disebut dalam dokumen sebagai laporan akhir untuk konsultasi'],
    ['sources accessed on this date, as stated in the document', 'sumber diakses pada tanggal ini, sebagaimana dinyatakan dalam dokumen'],
    ['session date on slide', 'tanggal sesi pada salindia'], ['refers to', 'mengacu pada'], ['allocations', 'alokasi'],
    ['Not stated in the excerpt', 'Tidak dinyatakan dalam kutipan'], ['Not stated', 'Tidak dinyatakan'],
    ['scan created', 'pindaian dibuat'], ['PDF created', 'PDF dibuat'], ['file printed', 'berkas dicetak'],
    ['January', 'Januari'], ['February', 'Februari'], ['March', 'Maret'], ['May', 'Mei'], ['June', 'Juni'], ['July', 'Juli'],
    ['August', 'Agustus'], ['October', 'Oktober'], ['December', 'Desember'],
  ];
  /** Publication-date notes ("2022 (PDF created 2022-10-07)"). Dates themselves are kept as written. */
  function date(text, lang) {
    const s = String(text == null ? '' : text);
    if (lang !== 'id' || !s) return { text: s, original: false };
    let out = s.replace(/refers to (\d{4}) allocations/g, 'mengacu pada alokasi $1');
    for (const [en, id] of DATE_PARTS) out = out.split(en).join(id);
    // any English word left means the note is only partly known
    const left = /\b(created|stated|printed|accessed|document|report|the|on|in|as|refers)\b/.test(out);
    return left ? { text: s, original: true } : { text: out, original: false };
  }

  /** Page, slide or section reference; section names stay as written in the source. */
  function locator(loc, lang) {
    const l = loc || {};
    const id = lang === 'id';
    if (l.page) return `${id ? 'hlm.' : 'p.'} ${l.page}${l.printed_page ? ` (${id ? 'hlm. cetak' : 'printed p.'} ${l.printed_page})` : ''}`;
    if (l.slide) return `${id ? 'salindia' : 'slide'} ${l.slide}`;
    if (l.section) return `${id ? 'bagian' : 'section'} “${l.section}”`;
    return '';
  }

  const isRoleNote = text => Object.prototype.hasOwnProperty.call(ROLE_NOTES, text);

  return { localize, date, locator, isRoleNote, ID };
});
