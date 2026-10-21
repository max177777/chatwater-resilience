/*
 * Stage 4 — financing pathways matched to the selected actions and the utility profile
 * (meeting feedback, Oct 2026: "connect financing options to project type, eligibility
 * requirements, institutional arrangements and financing guidelines").
 *
 * The list lives in frameworks/pathways.json (draft, not reviewed). Matching is a transparent
 * set of reasons, never a score of eligibility: a pathway is "matched" when at least one reason
 * applies, and every reason is shown to the user. Documents come from the library curation file,
 * so their caveats travel with them even when the library itself is not built.
 */
const CW = require('../public/js/cw-core');
const RS = require('../public/js/responsibility');
const PATHWAYS = require('../frameworks/pathways.json');
const LIB = require('../scripts/library/sources.json');
const { uiText } = require('./export');

const libSources = (() => {
  const s = LIB.sources;
  const list = Array.isArray(s) ? s : Object.entries(s || {}).map(([path, v]) => ({ path, ...v }));
  return new Map(list.filter(x => x.id).map(x => [x.id, x]));
})();

const SMALL = ['pump_audit'];
const CAPITAL = ['pump_upgrade', 'nrw_reduction', 'septic_desludging', 'cso_reduction', 'biogas_capture', 'solar_pv', 'fuel_switch'];

/** Category of an action: the rule's own category, or for user actions the service area of its location. */
function categoryOf(a) {
  if (CW.isCustom(a)) {
    const r = RS.forOption(a, null);
    return r && r.area === 'water_supply' ? 'water' : r && r.area && r.area !== 'utility' ? 'sanitation' : null;
  }
  return ['energy', 'water', 'sanitation'].includes(a.category) ? a.category : null;
}

/**
 * actions: selected actions (calculated and user-proposed); profile: utility profile.
 * Returns { matched: [pathway + reasons], other: [...], review_status }.
 */
function match({ actions = [], profile = null, lang = 'en' } = {}) {
  const acts = actions.filter(a => a && a.rule !== 'baseline');
  const cats = new Set(acts.map(categoryOf).filter(Boolean));
  const capital = acts.some(a => CAPITAL.includes(a.rule) || CW.isCustom(a));
  const small = acts.some(a => SMALL.includes(a.rule));
  const conditional = acts.some(a => (RS.forOption(a, profile) || {}).tier === 'conditional');
  const capex = profile && profile.capex;
  const u = k => uiText(k, lang);
  const out = PATHWAYS.pathways.map(p => {
    const f = p.fits || {};
    const reasons = [];
    const shared = (f.categories || []).filter(c => cats.has(c));
    if (shared.length) reasons.push(u('fpw_category').replace('{c}', shared.map(c => u('cat_' + c)).join(', ')));
    if (f.capital && capital) reasons.push(u('fpw_capital'));
    if (f.small && small) reasons.push(u('fpw_small'));
    if (f.conditional && conditional) reasons.push(u('fpw_tier_conditional'));
    if (capex && (f.capex || []).includes(capex) && (capex === 'external' || capex === 'partial')) reasons.push(u('fpw_capex_' + capex));
    const documents = (p.documents || []).map(id => libSources.get(id)).filter(Boolean)
      .map(s => ({ id: s.id, title: s.title, caveat: Array.isArray(s.caveats) ? s.caveats[0] : s.caveats || null }));
    // a category match alone is weak; a pathway is shortlisted when something beyond the category also fits
    const strong = reasons.length - (shared.length ? 1 : 0);
    return { ...p, reasons, documents, strength: strong, matched: shared.length > 0 && (strong > 0 || !f.capital) };
  });
  const order = (a, b) => b.strength - a.strength;
  return {
    review_status: PATHWAYS.review_status,
    matched: out.filter(p => p.matched).sort(order),
    other: out.filter(p => !p.matched),
  };
}

/** The pathways the user ticked, as drafting sees them (no eligibility claims). */
function forFacts(ids, lang = 'en') {
  const L = o => (o && typeof o === 'object') ? (o[lang] || o.en) : o;
  return (ids || []).map(id => PATHWAYS.pathways.find(p => p.id === id)).filter(Boolean).map(p => ({
    name: L(p.name), who_applies: L(p.who), status: 'pathway to investigate; eligibility not confirmed',
    questions_to_confirm: (p.questions || []).map(L),
  }));
}

module.exports = { match, forFacts, categoryOf, PATHWAYS };
