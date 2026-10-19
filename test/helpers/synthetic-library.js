/*
 * A tiny SYNTHETIC document library for tests that need indexed passages when the real library
 * (knowledge/library/, generated and git-ignored) has not been built. Every sentence below was written
 * for the tests; none is taken from a source document. Tests that measure retrieval quality on the real
 * corpus do not use this: they report a missing prerequisite instead.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const library = require('../../engine/library');

const GUIDE = [
  'A pump audit measures flow, head and electrical power at the pump to work out wire-to-water efficiency before an upgrade of the pump system or river intake pumping.',
  'Scheduled desludging of household septic tanks empties faecal sludge on a fixed cycle; implementation needs truck operators and a sludge treatment plant.',
  'A project summary states the climate benefit, the utility, the selected actions and the amount requested.',
  'Describe the utility service area, the population served, and the climate hazards and vulnerability that affect water supply.',
  'The climate rationale links the baseline to the climate risks that the project responds to.',
  'Baseline greenhouse gas emissions come from energy use and wastewater treatment during the assessment period.',
  'Emission reduction is the difference between baseline emissions and emissions with the project.',
  'Replication, scaling, knowledge sharing and an enabling environment extend a project beyond one utility.',
  'Co-benefits include public health and better service quality for water and sanitation users.',
  'Needs cover vulnerability, the financing gap and limited utility capacity.',
  'Country ownership means alignment with national climate policy and the country programme.',
  'Cost effectiveness and co-financing show efficient use of grant funds.',
  'An implementation plan for the water utility sets phases, procurement steps and responsibilities.',
  'The budget lists project cost, investment needs and financing sources.',
  'Climate risks, risk mitigation measures and safeguards are listed for each project risk.',
  'Monitoring uses indicators, measurement and verification of results in a results framework.',
  'The grid emission factor converts electricity use into emissions.',
];

function write(dir) {
  fs.mkdirSync(path.join(dir, 'passages'), { recursive: true });
  const src = (id, role, extra = {}) => ({ id, title: `Synthetic ${role} (test only)`, publisher: null, date: null, role, language: 'en', stages: [2, 3, 4],
    sector: 'water and sanitation', status: 'indexed', caveats: ['Synthetic test-only source; not a real document.'], review_status: 'Synthetic',
    extraction: { quality: 'good', notes: [], passages: 0 }, relationships: [], ...extra });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ schema: 1, note: 'SYNTHETIC test fixture', sources: [src('synthetic-guide', 'guidance'), src('synthetic-training', 'training_example')] }));
  const p = (source, n, text) => ({ id: `${source}#p${n}-1`, source, locator: { page: n }, heading: '', text: `SYNTHETIC TEST TEXT. ${text}`, language: 'en' });
  fs.writeFileSync(path.join(dir, 'passages', 'synthetic-guide.json'), JSON.stringify([
    ...GUIDE.map((t, i) => p('synthetic-guide', i + 1, t)),
    // unrelated filler so word weights behave roughly as in a real collection
    ...Array.from({ length: 30 }, (_, i) => p('synthetic-guide', GUIDE.length + i + 1, `Filler ${i}. Rainfall records for district ${i} were archived with the regional office in volume ${i}.`)),
  ]));
  fs.writeFileSync(path.join(dir, 'passages', 'synthetic-training.json'), JSON.stringify([
    p('synthetic-training', 1, 'A utility in a training slide reported its specific energy consumption after replacing a pump.'),
  ]));
  return dir;
}

/** Use the built library if there is one; otherwise load the synthetic one. Returns { synthetic, reload, restore }. */
function ensureLibrary() {
  if (library.summary().loaded) return { synthetic: false, reload: () => library.load(), restore: () => {} };
  const dir = write(fs.mkdtempSync(path.join(os.tmpdir(), 'cw-synthetic-lib-')));
  library.load(dir);
  return { synthetic: true, reload: () => library.load(dir), restore: () => { library.load(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

module.exports = { write, ensureLibrary };
