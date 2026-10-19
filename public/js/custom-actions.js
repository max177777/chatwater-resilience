/*
 * User-proposed ("custom") actions, shared by the browser (global CA) and the server.
 *
 * A custom action is an explicit action type next to the calculated rule-based options:
 *   origin 'user', rule 'custom', key `${assessmentId}|custom|${cid}`, display label U01, U02 …
 * It carries only what the user wrote. It has no benefit figures: GHG and energy benefits are
 * always "not quantified", it is never classified as direct or indirect, and it is not reviewed.
 * Locations point at a ChatWater substage ID (or the assessment as a whole), never at a name or
 * array position, so renaming keeps the link and a deleted substage is reported, not reassigned.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cw-core'));
  else root.CA = factory(root.CW);
})(typeof self !== 'undefined' ? self : this, function (CW) {
  const ORIGIN = 'user', RULE = 'custom';
  const LIMITS = { title: 120, description: 2000, problem: 300, notes: 2000 };
  const CID = /^c_[a-z0-9]{8,32}$/;
  const LABEL = /^U\d{2,4}$/;
  // Every field a custom action may carry. Anything else (evidence, basis, scenario, figures …) is rejected.
  const FIELDS = ['origin', 'rule', 'cid', 'key', 'id', 'assessmentId', 'title', 'description', 'problem', 'location',
    'notes', 'created_at', 'updated_at', 'expected_kgco2', 'expected_kwh', 'benefit_status', 'category'];
  const NOT_QUANTIFIED = { kgco2: 'not_quantified', kwh: 'not_quantified' };

  const isCustom = CW.isCustom;
  const clean = v => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim();
  const keyOf = (assessmentId, cid) => CW.actionKey(assessmentId, RULE, cid);

  /** Substage ID -> { prefix, index } for one assessment's metadata. */
  function sidIndex(meta) {
    const out = new Map();
    for (const [prefix, list] of Object.entries((meta && meta.substages) || {})) (list || []).forEach((sid, index) => sid && out.set(sid, { prefix, index }));
    return out;
  }
  /** { at: 'assessment' } | { at: 'substage', prefix, sid, index } | { at: 'missing', prefix, sid } (substage no longer exists). */
  function resolveLocation(a, meta) {
    const loc = a && a.location;
    if (!loc || loc.at !== 'substage') return { at: 'assessment' };
    const hit = sidIndex(meta).get(loc.sid);
    return hit && hit.prefix === loc.prefix ? { at: 'substage', prefix: hit.prefix, sid: loc.sid, index: hit.index } : { at: 'missing', prefix: loc.prefix || null, sid: loc.sid || null };
  }

  /** Field problems in user input, as codes for the form: { field: 'required' | 'too_long' }. */
  function fieldErrors(input) {
    const e = {};
    for (const f of ['title', 'description']) if (!clean(input[f])) e[f] = 'required';
    for (const [f, max] of Object.entries(LIMITS)) if (clean(input[f]).length > max) e[f] = 'too_long';
    return e;
  }
  function locationFrom(input) {
    const l = input && input.location;
    return l && l.at === 'substage' && l.sid ? { at: 'substage', prefix: String(l.prefix || ''), sid: String(l.sid) } : { at: 'assessment' };
  }
  /**
   * New custom action. input: { title, description, problem, location }; notes live with the other
   * action notes (state.actionNotes[key]). Returns null when a required field is missing or too long.
   */
  function create({ assessmentId, cid, label, input, now }) {
    if (!assessmentId || !CID.test(cid) || Object.keys(fieldErrors(input)).length) return null;
    return {
      origin: ORIGIN, rule: RULE, cid, key: keyOf(assessmentId, cid), id: label, assessmentId,
      title: clean(input.title), description: clean(input.description), problem: clean(input.problem),
      location: locationFrom(input), created_at: now, updated_at: now,
      expected_kgco2: null, expected_kwh: null, benefit_status: { ...NOT_QUANTIFIED },
    };
  }
  /** Edited copy; identity, origin, label and source assessment never change. */
  function update(a, input, now) {
    if (Object.keys(fieldErrors(input)).length) return null;
    return { ...a, title: clean(input.title), description: clean(input.description), problem: clean(input.problem), location: locationFrom(input), updated_at: now };
  }
  /** Next unused display label for an assessment; labels of deleted actions are not reused. */
  function nextLabel(used) {
    const n = (used || []).reduce((m, l) => Math.max(m, LABEL.test(l) ? parseInt(l.slice(1), 10) : 0), 0);
    return 'U' + String(n + 1).padStart(2, '0');
  }

  /**
   * Structural check used by the server before anything is planned, drafted or exported.
   * meta: the source assessment's metadata. Returns problem codes; empty means valid.
   */
  function validate(a, meta) {
    const p = [];
    if (!a || typeof a !== 'object' || Array.isArray(a)) return ['not_object'];
    for (const k of Object.keys(a)) if (!FIELDS.includes(k)) p.push('unknown_field:' + k);
    if (a.origin !== ORIGIN || a.rule !== RULE) p.push('origin');
    if (typeof a.cid !== 'string' || !CID.test(a.cid)) p.push('cid');
    if (!meta || !meta.id || a.assessmentId !== meta.id) p.push('assessment');
    else if (a.key !== keyOf(meta.id, a.cid)) p.push('key');
    if (typeof a.id !== 'string' || !LABEL.test(a.id)) p.push('label');
    for (const f of ['title', 'description', 'problem', 'notes']) if (a[f] != null && typeof a[f] !== 'string') p.push('type:' + f);
    const errs = fieldErrors({ title: a.title, description: a.description, problem: a.problem, notes: a.notes });
    for (const [f, code] of Object.entries(errs)) p.push(`${f}_${code}`);
    // user actions never carry trusted figures
    if (a.expected_kgco2 != null || a.expected_kwh != null) p.push('figures');
    if (a.benefit_status != null && (a.benefit_status.kgco2 !== 'not_quantified' || a.benefit_status.kwh !== 'not_quantified'
      || Object.keys(a.benefit_status).some(k => !(k in NOT_QUANTIFIED)))) p.push('figures');
    if (a.category != null && a.category !== RULE) p.push('category');
    const loc = a.location;
    if (loc != null && (typeof loc !== 'object' || !['assessment', 'substage'].includes(loc.at)
      || Object.keys(loc).some(k => !['at', 'prefix', 'sid'].includes(k)))) p.push('location_invalid');
    else if (meta && meta.id && resolveLocation(a, meta).at === 'missing') p.push('location_missing');
    return p;
  }

  return { ORIGIN, RULE, LIMITS, FIELDS, isCustom, keyOf, sidIndex, resolveLocation, fieldErrors, create, update, nextLabel, validate, NOT_QUANTIFIED };
});
