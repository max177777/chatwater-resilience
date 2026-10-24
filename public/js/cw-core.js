/*
 * ChatWater Resilience — data-integrity rules shared by the browser and the server.
 *
 * ChatWater keeps its own metadata (assessment and substage IDs) next to the
 * ECAM JSON, never inside it, so ECAM files stay loadable in the official tool.
 *
 *   revision(assessment)  content fingerprint of the calculation inputs
 *   withKeys(options, m)  action identity = assessment ID | rule | substage ID
 *   planDeps / proposalDeps   what a draft was generated from
 *   freshness(ctx)        which outputs are outdated, as reason codes
 *   migrate(state)        upgrade a schema-1 browser session
 *   regenerate / restoreVersion   keep one recoverable previous plan and proposal
 *   loadSession / writeSession    browser storage that never overwrites a session it could not back up
 *   unitView(...)         display unit and multiplier for an ECAM input
 *   inputState(...)       origin and confirmation of the inputs read by the covered rule checks
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CW = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SCHEMA = 2;
  const STAGE_KEYS = [
    ['wsa', 'Water', 'Abstraction'], ['wst', 'Water', 'Treatment'], ['wsd', 'Water', 'Distribution'],
    ['wwc', 'Waste', 'Collection'], ['wwt', 'Waste', 'Treatment'], ['wwo', 'Waste', 'Onsite'],
  ];

  // ------------------------------------------------------------ fingerprints
  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort()
        .filter(k => v[k] !== undefined && typeof v[k] !== 'function')
        .map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  function hash(str) {
    let a = 0x811c9dc5, b = 0x9e3779b9;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619);
      b = Math.imul(b ^ c, 2246822519);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  const fp = v => hash(canonical(v == null ? null : v));

  /** Fingerprint of everything that can change a result. Names, comments and display units are excluded. */
  function revision(assessment) {
    if (!assessment) return null;
    const c = JSON.parse(JSON.stringify(assessment));
    if (c.General) { delete c.General.Name; delete c.General.Comments; }
    delete c.Configuration;
    for (const [, lv, sl] of STAGE_KEYS) {
      for (const ss of (c[lv] && c[lv][sl]) || []) {
        delete ss.name;
        if (ss.Configuration) delete ss.Configuration.FoldedQuestions;
      }
    }
    return fp(c);
  }

  // ------------------------------------------------------------ action identity
  function actionKey(assessmentId, rule, substageId) {
    return `${assessmentId || '?'}|${rule}|${substageId || 'utility'}`;
  }
  /** ChatWater substage ID for { prefix, index }, from meta aligned with the ECAM arrays. */
  function substageId(meta, s) {
    return s ? ((meta && meta.substages && meta.substages[s.prefix] && meta.substages[s.prefix][s.index]) || `${s.prefix}#${s.index}`) : null;
  }
  /** Attach a stable key to each option. meta = { id, substages: { wsa: [id, …], … } } aligned with the ECAM arrays. */
  function withKeys(options, meta) {
    return options.map(o => ({ ...o, key: actionKey(meta && meta.id, o.rule, substageId(meta, o.substage)) }));
  }
  /** Attach the substage ID to each rule check, so it can be matched to options and input status. */
  function withCheckIds(checks, meta) {
    return (checks || []).map(c => ({ ...c, sid: substageId(meta, c.substage) }));
  }
  /** Display labels (A01, A02 …) that stay with an action across re-runs. Returns the updated label map. */
  function assignLabels(options, labels) {
    const map = { ...(labels || {}) };
    let next = Object.values(map).reduce((m, l) => Math.max(m, parseInt(String(l).slice(1), 10) || 0), 0);
    for (const o of options) {
      if (o.rule === 'baseline') { o.id = 'A00'; continue; }
      if (!map[o.key]) map[o.key] = 'A' + String(++next).padStart(2, '0');
      o.id = map[o.key];
    }
    return map;
  }
  const titleEn = a => (a && a.title && typeof a.title === 'object') ? a.title.en : (a && a.title);
  /**
   * Match schema-1 selections to new options by rule and exact English title. A selection is
   * restored only when exactly one option matches and no other old selection claims that option;
   * everything else goes to review.
   */
  function mapLegacy(legacyActions, options) {
    const old = (legacyActions || []).filter(a => a.rule !== 'baseline');
    const hitsOf = a => titleEn(a) ? options.filter(o => o.rule === a.rule && titleEn(o) === titleEn(a)) : [];
    const hits = old.map(hitsOf);
    const claims = new Map();
    hits.forEach(h => { if (h.length === 1) claims.set(h[0].key, (claims.get(h[0].key) || 0) + 1); });
    const mapped = [], review = [];
    old.forEach((a, i) => {
      const h = hits[i];
      if (h.length === 1 && claims.get(h[0].key) === 1) mapped.push({ from: a, key: h[0].key }); else review.push(a);
    });
    return { mapped, review };
  }

  // ------------------------------------------------------------ dependencies
  const num = v => (typeof v === 'number' && Number.isFinite(v)) ? +v.toPrecision(12) : null;
  /** User-proposed action (custom-actions.js). Anything claiming either marker takes the custom path. */
  const isCustom = a => !!a && (a.origin === 'user' || a.rule === 'custom');
  /** Everything of a custom action that plans, proposals and exports use. */
  const customContent = a => ({
    title: String(a.title || ''), description: String(a.description || ''), problem: String(a.problem || ''),
    location: a.location && a.location.at === 'substage' ? { at: 'substage', prefix: a.location.prefix || null, sid: a.location.sid || null } : { at: 'assessment' },
    label: a.id || null, notes: a.notes || '',
  });
  function actionsFingerprint(actions) {
    return fp((actions || []).filter(a => a.rule !== 'baseline').map(a => ({
      key: a.key || null, rule: a.rule, title: titleEn(a) || null,
      kg: num(a.expected_kgco2), kwh: num(a.expected_kwh), notes: a.notes || '',
      custom: isCustom(a) ? customContent(a) : undefined,
    })).sort((x, y) => String(x.key || x.title).localeCompare(String(y.key || y.title))));
  }
  /** Current custom-action definitions with their notes, as freshness() compares them with the saved selection. */
  const customDefs = (customActions, actionNotes) => (customActions || []).map(c => ({ ...c, notes: (actionNotes && actionNotes[c.key]) || '' }));
  /** Every plan field a proposal is drafted or exported with: summary, tasks, owners and timing. */
  function planFingerprint(plan) {
    if (!plan || !plan.tasks) return null;
    return fp({
      summary: plan.summary || '',
      // the project concept (team framework areas); absent in older plans, so their fingerprints stay the same
      concept: plan.concept && plan.concept.areas ? plan.concept.areas.map(a => a.text || '') : undefined,
      total_weeks: plan.total_weeks == null ? null : plan.total_weeks,
      tasks: plan.tasks.map(t => ({
        id: t.id, action_key: t.action_key || null, action_id: t.action_id, action: t.action || null, name: t.name,
        owner: t.owner, start_week: t.start_week, weeks: t.weeks, depends_on: t.depends_on || [],
      })),
    });
  }
  function frameworkKey(f) {
    const route = (f && f.route) || 'general';
    const base = route === 'custom' ? 'custom:' + fp(f.customFramework ? f.customFramework.sections : null) : route;
    // financing pathways the user ticked are drafted into the proposal; none ticked keeps older keys unchanged
    const pw = f && Array.isArray(f.pathways) && f.pathways.length ? ':pw:' + fp(f.pathways.slice().sort()) : '';
    return base + pw;
  }
  function planDeps({ assessmentId, assessment, gwpIndex, actions, profile }) {
    return {
      assessmentId: assessmentId || null, revision: revision(assessment), gwpIndex: gwpIndex || 0,
      actionsFingerprint: actionsFingerprint(actions), profile: fp(profile),
    };
  }
  function proposalDeps({ assessmentId, assessment, gwpIndex, actions, plan, profile, financing }) {
    return {
      ...planDeps({ assessmentId, assessment, gwpIndex, actions, profile }),
      planFingerprint: planFingerprint(plan), framework: frameworkKey(financing),
    };
  }

  // ------------------------------------------------------------ freshness
  /**
   * ctx: { assessments: [{ id, revision }], gwpIndex, actionResult, actionSet, selectedActions, plan, proposal, profile, financing,
   *        customActions? (customDefs(); when given, edited or deleted selected user actions mark the selection outdated),
   *        rejected? ({ key: { reason, at } }; a saved selected action marked not relevant makes the selection outdated) }
   * Returns reason codes per output; an empty list means current.
   */
  /** Saved selected actions the user has since marked not relevant. */
  const rejectedInSelection = (selectedActions, rejected) => (selectedActions || []).filter(a => a && a.key && rejected && typeof rejected === 'object' && rejected[a.key]);
  function freshness(ctx) {
    const find = id => (ctx.assessments || []).find(a => a.id === id);
    const gwp = ctx.gwpIndex || 0;
    const basis = b => {
      if (!b || b.legacy || !b.revision) return ['legacy'];
      const a = find(b.assessmentId);
      if (!a) return ['assessment_missing'];
      const r = [];
      if (a.revision !== b.revision) r.push('assessment_changed');
      if ((b.gwpIndex || 0) !== gwp) r.push('gwp_changed');
      return r;
    };
    const out = { options: [], actions: [], plan: [], proposal: [] };
    if (ctx.actionResult) out.options = ctx.actionResult.legacy ? ['legacy'] : basis(ctx.actionResult.basis);
    const sel = (ctx.selectedActions || []).filter(a => a.rule !== 'baseline');
    if (sel.length) out.actions = basis(ctx.actionSet);
    // a selected user action edited or deleted since the selection was saved (ctx.customActions from customDefs)
    if (Array.isArray(ctx.customActions)) {
      const defs = new Map(ctx.customActions.map(c => [c.key, c]));
      for (const a of sel.filter(isCustom)) {
        const d = defs.get(a.key);
        if (!d) out.actions.push('custom_deleted');
        else if (fp(customContent(d)) !== fp(customContent(a))) out.actions.push('custom_changed');
      }
    }
    if (ctx.rejected && typeof ctx.rejected === 'object' && sel.some(a => a.key && ctx.rejected[a.key])) out.actions.push('action_rejected');
    const actionsFp = actionsFingerprint(ctx.selectedActions);
    const profileFp = fp(ctx.profile);
    if (ctx.plan) {
      const d = ctx.plan.deps;
      if (!d) out.plan = ['legacy'];
      else {
        const r = basis(d);
        if (d.actionsFingerprint !== actionsFp) r.push('actions_changed');
        if (out.actions.length) r.push('actions_outdated');
        if (d.profile !== profileFp) r.push('profile_changed');
        out.plan = r;
      }
    }
    if (ctx.proposal) {
      const d = ctx.proposal.deps;
      if (!d) out.proposal = ['legacy'];
      else {
        const r = basis(d);
        if (d.actionsFingerprint !== actionsFp) r.push('actions_changed');
        if (out.actions.length) r.push('actions_outdated');
        if (d.planFingerprint !== planFingerprint(ctx.plan)) r.push('plan_changed');
        if (ctx.plan && out.plan.length) r.push('plan_outdated');
        if (d.framework !== frameworkKey(ctx.financing)) r.push('framework_changed');
        if (d.profile !== profileFp) r.push('profile_changed');
        out.proposal = r;
      }
    }
    for (const k of Object.keys(out)) out[k] = [...new Set(out[k])];
    return out;
  }

  // Sentences that earlier template versions used to add the selected actions' reductions together.
  const SUMMED_CLAIMS = [/Calculated reductions add up to about/i, /Pengurangan yang telah dihitung sekitar/i];
  const hasSummedClaim = text => typeof text === 'string' && SUMMED_CLAIMS.some(re => re.test(text));
  /** Which saved outputs still contain such a sentence: { plan: bool, proposal: [section titles] }. */
  function summedClaims({ plan, proposal } = {}) {
    return {
      plan: !!(plan && hasSummedClaim(plan.summary)),
      proposal: ((proposal && proposal.sections) || []).filter(s => hasSummedClaim(s.text)).map(s => s.title || s.key),
    };
  }

  // ------------------------------------------------------------ migration
  function newMeta(assessment, newId) {
    return {
      id: newId('a'),
      substages: Object.fromEntries(STAGE_KEYS.map(([p, lv, sl]) =>
        [p, ((assessment && assessment[lv] && assessment[lv][sl]) || []).map(() => newId('s'))])),
    };
  }
  /**
   * Schema 1 → 2. Nothing the user wrote is dropped: plan, proposal, selected
   * actions and notes are kept. Links that cannot be proven are left unset, so
   * freshness() reports them as 'legacy' and the user reviews them.
   */
  function migrate(s, newId) {
    if (!s || typeof s !== 'object' || s.schema >= SCHEMA) return s;
    const list = Array.isArray(s.assessments) ? s.assessments : [];
    const meta = list.map(a => newMeta(a, newId));
    const idAt = i => (meta[i] && meta[i].id) || null;
    const byName = name => {
      const hits = list.map((a, i) => (a && a.General && a.General.Name === name ? i : -1)).filter(i => i >= 0);
      return hits.length === 1 ? idAt(hits[0]) : null;
    };
    const out = { ...s, schema: SCHEMA, assessmentMeta: meta };
    out.selectedAssessmentId = idAt(s.selectedAssessment || 0);
    out.finished = {};
    for (const [name, at] of Object.entries(s.finished || {})) { const id = byName(name); if (id) out.finished[id] = at; }
    const legacyId = s.actionResult ? byName(s.actionResult.assessmentName) : null;
    if (s.actionResult) out.actionResult = { ...s.actionResult, assessmentId: legacyId, basis: null, legacy: true };
    if ((s.selectedActions || []).length) out.actionSet = { assessmentId: legacyId, legacy: true };
    out.selectedKeys = [];
    out.actionNotes = {};
    out.legacy = { selectedIds: s.selectedIds || [], actionNotes: s.actionNotes || {}, explanations: s.explanations || {} };
    out.explanations = {};
    delete out.selectedIds; delete out.selectedAssessment;
    return out;
  }

  // ------------------------------------------------------------ previous versions
  // One recoverable previous version per output ('plan' | 'proposal'), stored with its edits and deps.
  // Versions are copied as-is: freshness is always recomputed from deps, so a restored
  // version is only current if its deps still match the current upstream data.
  const copy = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  function commitVersion(s, key, next, at) {
    s.previous = s.previous || {};
    if (s[key]) s.previous[key] = { at: at || new Date().toISOString(), value: copy(s[key]) };
    s[key] = next;
    return s;
  }
  /** Replace s[key] only once generate() has succeeded; on failure the current version is untouched. */
  async function regenerate(s, key, generate, at) {
    const next = await generate();
    if (!next || typeof next !== 'object') throw new Error('Generation returned nothing.');
    return commitVersion(s, key, next, at);
  }
  /** Swap current and previous, so a restore can itself be undone. */
  function restoreVersion(s, key, at) {
    const prev = s.previous && s.previous[key];
    if (!prev) return false;
    const cur = s[key];
    s[key] = copy(prev.value);
    if (cur) s.previous[key] = { at: at || new Date().toISOString(), value: copy(cur) };
    else delete s.previous[key];
    return true;
  }

  // ------------------------------------------------------------ browser storage
  const isQuota = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
  /**
   * Read and, if needed, migrate the saved session. The original is never modified here.
   * problem: 'read_failed' | 'unreadable' | 'backup_failed' — the caller must not write over
   * the original until the user has a copy (original holds the untouched saved text).
   */
  function loadSession(storage, key, newId) {
    let text;
    try { text = storage.getItem(key); } catch (e) { return { state: null, problem: 'read_failed', error: e, original: null }; }
    if (!text) return { state: null };
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return { state: null, problem: 'unreadable', error: e, original: text }; }
    if (!raw || typeof raw !== 'object') return { state: null, problem: 'unreadable', original: text };
    if (raw.schema >= SCHEMA) return { state: raw };
    try { storage.setItem(key + '.schema1-backup', text); } catch (e) {
      return { state: migrate(JSON.parse(text), newId), problem: 'backup_failed', error: e, quota: isQuota(e), original: text };
    }
    return { state: migrate(raw, newId), migrated: true };
  }
  /** Write the session. A failed setItem leaves the previously saved value in place. */
  function writeSession(storage, key, s) {
    let text;
    try { text = JSON.stringify(s); } catch (e) { return { ok: false, error: e, quota: false }; }
    try { storage.setItem(key, text); return { ok: true }; } catch (e) { return { ok: false, error: e, quota: isQuota(e) }; }
  }

  // ------------------------------------------------------------ input status
  // Entry status is kept for the inputs read by the covered rule checks only. It lives in
  // state.inputStatus[assessmentId] = { origin: 'new' | …, s: { substageId: { code: { o, c, v } } } },
  // never in the ECAM JSON. o = how Stage 1 set the value (INPUT_ORIGINS), c = confirmed in Stage 2.
  // Origin and confirmation are independent: confirming an ECAM estimate keeps it an estimate.
  // A record only holds while the value is unchanged since it was made.
  const PUMP_INPUTS = p => ['flow', 'head', 'volt', 'amps', 'pf', 'exff'].map(k => `${p}_pmp_${k}`);
  const TRACKED_INPUTS = {
    wsa: PUMP_INPUTS('wsa'), wwc: PUMP_INPUTS('wwc'),
    wsd: [...PUMP_INPUTS('wsd'), 'wsd_vol_dist', 'wsd_auth_con'],
    wwo: ['wwo_cont_emp'],
  };
  const isTracked = (prefix, code) => !!(TRACKED_INPUTS[prefix] && TRACKED_INPUTS[prefix].includes(code));
  const INPUT_ORIGINS = ['manual', 'estimate', 'typical'];
  const sameValue = (r, value) => r.v === value || (r.v == null && value == null);
  const recordOf = (record, sid, code) => record && record.s && record.s[sid] && record.s[sid][code];
  /**
   * { origin, confirmed }. origin: 'manual' | 'estimate' | 'typical' (set in Stage 1),
   * 'default' (untouched, assessment created here) or 'unknown' (imported, older session, or changed since recorded).
   * Records saved as { st: 'entered' | 'confirmed' } before origins were split are read as manual / confirmed.
   */
  function inputState(record, sid, code, value) {
    const r = recordOf(record, sid, code);
    const untouched = record && record.origin === 'new' ? 'default' : 'unknown';
    if (r && sameValue(r, value)) {
      const o = r.o || (r.st === 'entered' ? 'manual' : null);
      return { origin: INPUT_ORIGINS.includes(o) ? o : untouched, confirmed: !!(r.c || r.st === 'confirmed') };
    }
    return { origin: r ? 'unknown' : untouched, confirmed: false };
  }
  /** A manual entry is the user's own value; anything else needs a confirmation. */
  const needsConfirm = s => !s.confirmed && s.origin !== 'manual';
  const ensureRecord = (map, assessmentId, sid) => {
    const rec = map[assessmentId] = map[assessmentId] || { origin: 'unknown', s: {} };
    rec.s = rec.s || {};
    return (rec.s[sid] = rec.s[sid] || {});
  };
  /** Record how Stage 1 set a value. A new value starts unconfirmed. sid = ChatWater substage ID. */
  function setInputOrigin(map, assessmentId, sid, code, origin, value) {
    ensureRecord(map, assessmentId, sid)[code] = { o: INPUT_ORIGINS.includes(origin) ? origin : null, c: false, v: value };
    return map;
  }
  /** Confirm the current value, keeping its recorded origin when the value is unchanged. */
  function confirmInputValue(map, assessmentId, sid, code, value) {
    const subs = ensureRecord(map, assessmentId, sid);
    const r = subs[code];
    const o = r && sameValue(r, value) ? (r.o || (r.st === 'entered' ? 'manual' : null)) : null;
    subs[code] = { o, c: true, v: value };
    return map;
  }

  // ------------------------------------------------------------ units
  /** Unit label and multiplier for an ECAM input, honouring the assessment's unit preference (same rule as ECAM's Units.multiplier). */
  function unitView(Units, Info, scenario, code) {
    const info = Info[code];
    if (!info) return { unit: '', mult: 1 };
    const table = Units[info.magnitude];
    if (!table || typeof table !== 'object') return { unit: info.unit || '', mult: 1 };
    const pref = scenario && scenario.Configuration && scenario.Configuration.Units && scenario.Configuration.Units[code];
    const unit = pref && table[pref] ? pref : info.unit;
    return { unit: unit || '', mult: table[unit] || 1 };
  }

  // ------------------------------------------------------------ file imports
  const PROFILE_KEYS = ['name', 'location', 'country', 'service_type', 'population', 'served', 'connections', 'volume', 'staff', 'contact', 'notes',
    // responsibilities and capacity (responsibility.js)
    'resp_water_supply', 'resp_sewer', 'resp_wwtp', 'resp_onsite', 'resp_fs', 'capex', 'tech_capacity', 'data_availability'];
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const isEcamAssessment = o => isObj(o) && isObj(o.General) && STAGE_KEYS.every(([, lv, sl]) => isObj(o[lv]) && Array.isArray(o[lv][sl]) && o[lv][sl].every(ss => isObj(ss) && (ss.Configuration === undefined || (isObj(ss.Configuration) && isObj(ss.Configuration.Questions) && Object.values(ss.Configuration.Questions).every(v => typeof v === 'boolean')))));
  const looksLikeEcam = d => Array.isArray(d) ? d.some(o => isObj(o) && ('General' in o || 'Water' in o)) : isObj(d) && ('General' in d || 'Water' in d);
  /**
   * Check an ECAM file before anything is added: every assessment must be complete, or none is imported.
   * { ok: true, assessments } | { ok: false, reason: 'not_json' | 'profile_file' | 'empty' | 'not_ecam' }
   */
  function parseEcamFile(text) {
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, reason: 'not_json' }; }
    if (isObj(data) && !looksLikeEcam(data) && PROFILE_KEYS.some(k => k in data)) return { ok: false, reason: 'profile_file' };
    const list = Array.isArray(data) ? data : [data];
    if (!list.length) return { ok: false, reason: 'empty' };
    const finiteTree = v => typeof v === 'number' ? Number.isFinite(v) : v && typeof v === 'object' ? Object.values(v).every(finiteTree) : true;
    if (!list.every(finiteTree) || !list.every(isEcamAssessment)) return { ok: false, reason: 'not_ecam' };
    return { ok: true, assessments: list };
  }
  /** Profile fields from a JSON profile file. { ok: true, profile } | { ok: false, reason: 'not_json' | 'ecam_file' | 'no_profile_fields' } */
  function parseProfileJson(text) {
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, reason: 'not_json' }; }
    if (looksLikeEcam(data)) return { ok: false, reason: 'ecam_file' };
    if (!isObj(data) || !PROFILE_KEYS.some(k => data[k] != null)) return { ok: false, reason: 'no_profile_fields' };
    return { ok: true, profile: Object.fromEntries(PROFILE_KEYS.filter(k => data[k] != null).map(k => [k, data[k]])) };
  }
  /** "Name", or "Name (2)", "Name (3)" … when the name is already used, so imported copies can be told apart. */
  function uniqueName(name, taken) {
    const used = new Set(taken);
    if (!used.has(name)) return name;
    let n = 2;
    while (used.has(`${name} (${n})`)) n++;
    return `${name} (${n})`;
  }

  // ------------------------------------------------------------ display formatting
  // Display only: calculations, saved state and exports' data files keep plain numbers.
  const LOCALES = { en: 'en-US', id: 'id-ID' };
  const locale = lang => LOCALES[lang] || LOCALES.en;
  function formatNumber(n, lang, digits) {
    if (n == null || !Number.isFinite(n)) return '–';
    if (digits === undefined) {
      const a = Math.abs(n);
      digits = n === 0 ? 0 : a >= 1000 ? 0 : a >= 100 ? 1 : a >= 0.1 ? 2 : a >= 0.01 ? 3 : 4;
    }
    return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(n);
  }
  /** Date-only strings (YYYY-MM-DD) are calendar dates and must not shift with the time zone. */
  function formatDate(value, lang, withTime) {
    if (value == null || value === '') return '–';
    const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const opts = { dateStyle: 'medium', ...(withTime && !dateOnly ? { timeStyle: 'short' } : {}), ...(dateOnly ? { timeZone: 'UTC' } : {}) };
    return new Intl.DateTimeFormat(locale(lang), opts).format(d);
  }

  /**
   * Saved text whose last line stops mid-sentence (answers cut off by an output limit before that was
   * detected). Lists, tables, headings and placeholders may end without a full stop.
   */
  function mayBeIncomplete(text, opts = {}) {
    const lines = String(text || '').trim().split('\n').map(l => l.trim()).filter(Boolean);
    const open = l => !(/^([-*•+]|\d+[.)]|#|\|)/.test(l) || /\]\s*$/.test(l)) && !/[.!?:;)\]"'”’…*_]\s*$/.test(l);
    if (!lines.length) return false;
    // anyParagraph: template text that quotes earlier AI text, which may stop before the template's own lines
    return opts.anyParagraph ? lines.some(open) : open(lines[lines.length - 1]);
  }

  // Readable names for ECAM's GWP report identifiers; the identifier itself is kept, as ECAM files and citations use it.
  const GWP_NAMES = {
    'IPCC 5th AR (2014/2013) CCF': { en: 'IPCC Fifth Assessment Report, with climate–carbon feedbacks', id: 'Laporan Penilaian Kelima IPCC, dengan umpan balik iklim–karbon' },
    'IPCC 5th AR (2014/2013)': { en: 'IPCC Fifth Assessment Report, without climate–carbon feedbacks', id: 'Laporan Penilaian Kelima IPCC, tanpa umpan balik iklim–karbon' },
    'IPCC 4th AR (2007)': { en: 'IPCC Fourth Assessment Report', id: 'Laporan Penilaian Keempat IPCC' },
    'IPCC 3th AR (2001)': { en: 'IPCC Third Assessment Report', id: 'Laporan Penilaian Ketiga IPCC' },
    'IPCC 2nd AR (1995)': { en: 'IPCC Second Assessment Report', id: 'Laporan Penilaian Kedua IPCC' },
    'IPCC 1st AR (1990)': { en: 'IPCC First Assessment Report', id: 'Laporan Penilaian Pertama IPCC' },
  };
  /** "IPCC Fourth Assessment Report (IPCC 4th AR (2007))"; unknown identifiers are returned as written. */
  function gwpLabel(report, lang) {
    const n = GWP_NAMES[report];
    return n ? `${n[lang] || n.en} (${report})` : String(report || '');
  }

  // Unit words in ECAM's unit strings; symbols (kWh, m3, kgCO2eq, L) stay as written.
  const UNIT_WORDS_ID = {
    'g/person/day': 'g/orang/hari', 'kg/person/year': 'kg/orang/tahun', 'L/serv.pop./day': 'L/penduduk terlayani/hari', 'hours/day': 'jam/hari',
    'm asl': 'm dpl', adimensional: 'tanpa satuan', years: 'tahun', days: 'hari', people: 'orang', number: 'jumlah', ratio: 'rasio',
    moles: 'mol', 'Yes/No': 'Ya/Tidak', 'Fuel type': 'jenis bahan bakar', 'Pump type': 'jenis pompa', 'Pump size': 'ukuran pompa',
    'Potabilization chain': 'rangkaian pengolahan air minum', sec: 'detik', min: 'menit', hour: 'jam', day: 'hari', month: 'bulan',
  };
  const unitLabel = (unit, lang) => (lang === 'id' && UNIT_WORDS_ID[unit]) || unit;

  return {
    formatNumber, formatDate, mayBeIncomplete, gwpLabel, unitLabel,
    SCHEMA, STAGE_KEYS, canonical, hash, fp, revision, actionKey, substageId, withKeys, withCheckIds, assignLabels, mapLegacy,
    isCustom, customContent, customDefs, actionsFingerprint, planFingerprint, frameworkKey, planDeps, proposalDeps, freshness, rejectedInSelection, hasSummedClaim, summedClaims, migrate, unitView,
    commitVersion, regenerate, restoreVersion, loadSession, writeSession, isQuota,
    TRACKED_INPUTS, INPUT_ORIGINS, isTracked, inputState, needsConfirm, setInputOrigin, confirmInputValue,
    parseEcamFile, parseProfileJson, uniqueName,
  };
});
