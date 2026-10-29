/* Stage 4 keeps the non-GCF options visible for future development, but never selectable. */
const assert = require('assert');
const PW = require('../engine/pathways');
const FU = require('../public/js/feedback-ui');

const m = PW.demoMatch({ actions: [], profile: null, lang: 'en' });
assert.deepStrictEqual([...m.matched, ...m.other].map(p => p.id).filter(id => id !== 'gcf'), [], 'only GCF is active');
assert.deepStrictEqual(m.inactive.map(p => p.id), ['utility_budget', 'local_government', 'national_transfer', 'ppp', 'development_bank']);
console.log('  ok - /api/pathways lists the other pathways as inactive, GCF stays the only active choice');

const t = k => ({ fo_general: 'General proposal', fo_guide: 'Uploaded guide' }[k] || k);
const ctx = { t, L: v => (v && typeof v === 'object' ? v.en : v), esc: s => String(s) };
const html = FU.inactiveOptions(m, ctx);
assert.strictEqual((html.match(/data-inactive-option=/g) || []).length, 7, '5 pathways + 2 proposal formats');
assert.strictEqual((html.match(/<input type="checkbox" disabled/g) || []).length, 7, 'every inactive option is disabled');
assert.ok(!/data-fp=/.test(html), 'inactive options never bind to the active pathway selection');
assert.strictEqual((FU.inactiveOptions(null, ctx).match(/data-inactive-option=/g) || []).length, 2, 'renders before the server answers');
console.log('  ok - inactive options render greyed out and cannot be selected');
console.log('\nFinancing options tests passed');
