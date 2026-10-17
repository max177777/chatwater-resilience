/* Shared helpers for tests. All data derives from the HYPOTHETICAL sample utility. */
const CW = require('../../public/js/cw-core');

/** Deterministic ChatWater metadata for an assessment: substage IDs like wsa_0, wwo_0. */
function meta(assessment, id = 'a_test') {
  return {
    id,
    substages: Object.fromEntries(CW.STAGE_KEYS.map(([p, lv, sl]) => [p, (assessment[lv][sl] || []).map((_, i) => `${p}_${i}`)])),
  };
}
const clone = o => JSON.parse(JSON.stringify(o));

module.exports = { meta, clone };
