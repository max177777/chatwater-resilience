// Builds public/i18n/ecam.id.json (Bahasa Indonesia labels for ECAM variables,
// questions and option tables) from scripts/ecam-id-terms.json.
// Run after updating ECAM or the terms file:  node scripts/build-id-labels.js
const fs = require('fs'), path = require('path');
const E = require('../engine/ecam-engine')._ecam;
const en = require('../vendor/ecam/languages/en.json');
const terms = require('./ecam-id-terms.json');
const keys = new Set();
for (const k of Object.keys(E.Info)) keys.add(k + '_descr');
for (const s of E.Structure) (s.class.equations || []).forEach(e => keys.add(e + '_descr'));
for (const q of Object.keys(E.Questions)) if (typeof E.Questions[q] === 'object') keys.add(q);
for (const t of Object.keys(E.Tables)) if (Array.isArray(E.Tables[t])) E.Tables[t].forEach(r => keys.add(r.name));
const out = {}, missing = [];
for (const k of keys) {
  const v = en['#' + k];
  if (!v) continue;
  const id = terms[v.trim()];
  if (id) out['#' + k] = id; else missing.push(v);
}
fs.writeFileSync(path.join(__dirname, '..', 'public', 'i18n', 'ecam.id.json'), JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, 'labels written;', missing.length, 'missing', missing.slice(0, 10));
