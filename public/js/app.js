/*
 * ChatWater Resilience — app shell: state, language, routing, stages 2–4, chat.
 * ECAM objects (Ecam, Scenarios, Global, Structure, …) come from the unmodified
 * ECAM backend scripts loaded before this file.
 */
(() => {
  const STORE = 'cwr.v1';
  const $ = s => document.querySelector(s);

  // ---------------------------------------------------------------- state
  // ChatWater IDs live in a WeakMap keyed by the ECAM objects themselves, so they follow an
  // assessment or substage through reordering, renaming and deletion. They are saved in
  // state.assessmentMeta (aligned with state.assessments), never inside the ECAM JSON.
  const ids = new WeakMap();
  const newId = p => `${p}_${(window.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 16)}`;
  function idOf(obj, p = 'a') { let v = ids.get(obj); if (!v) { v = newId(p); ids.set(obj, v); } return v; }
  function metaOf(sc) {
    return { id: idOf(sc, 'a'), substages: Object.fromEntries(CW.STAGE_KEYS.map(([p, lv, sl]) => [p, sc[lv][sl].map(ss => idOf(ss, 's'))])) };
  }
  function attachMeta(sc, m) {
    if (!m?.id) return;
    ids.set(sc, m.id);
    for (const [p, lv, sl] of CW.STAGE_KEYS) sc[lv][sl].forEach((ss, i) => { const sid = m.substages?.[p]?.[i]; if (sid) ids.set(ss, sid); });
  }
  const byId = id => (id && Scenarios.find(s => idOf(s) === id)) || null;
  const plain = o => JSON.parse(JSON.stringify(o));

  const defaults = () => ({
    schema: CW.SCHEMA, lang: 'id', location: 'indonesia', profile: null,
    assessments: [], assessmentMeta: [], current: 0, gwpIndex: 0,
    finished: {}, // assessment ID -> ISO time of "finish assessment"
    selectedAssessmentId: null, actionResult: null, selectedKeys: [], actionNotes: {}, actionLabels: {}, actionReview: [],
    actionSet: null, selectedActions: [],
    plan: null, financing: { route: 'general' }, proposal: null,
    chat: [], checkpoints: [], explanations: {},
    inputStatus: {}, // assessment ID -> entry status of the inputs read by the covered rule checks (see CW.inputStatus)
    ui: { tab: 'assess', view: 'assess:choose', sel: { kind: 'general' }, chatOpen: true, actionSort: 'original' },
  });
  // storageLock: the saved session could not be read or backed up, so it must not be written over
  // until the user chooses to. storageFail: the last write failed (the previous save is still in place).
  let storageLock = null, storageFail = null, loaded;
  try { loaded = CW.loadSession(window.localStorage, STORE, newId); }
  catch (e) { loaded = { state: null, problem: 'read_failed', error: e, original: null }; }
  let state = Object.assign(defaults(), loaded.state || {});
  if (loaded.problem) storageLock = { kind: loaded.problem, quota: !!loaded.quota, original: loaded.original };
  state.ui = Object.assign(defaults().ui, state.ui || {});

  let LANGS = { en: {}, id: {} }; // ECAM label dictionaries
  let META = { ai: false };

  // ---------------------------------------------------------------- utils
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // ECAM labels contain a few formatting tags; keep only those.
  const rich = s => esc(s).replace(/&lt;(\/?)(sub|sup|b|i|br)\s*\/?&gt;/gi, '<$1$2>');
  const t = k => (UI[state.lang] && UI[state.lang][k]) ?? UI.en[k] ?? k;
  const tE = k => LANGS[state.lang]?.['#' + k] || LANGS.en['#' + k] || '';
  const stageLabel = k => (STAGE_LABELS[state.lang] || STAGE_LABELS.en)[k] || tE(k) || k;
  const L = o => (o && typeof o === 'object') ? (o[state.lang] || o.en) : (o ?? '');
  function fmt(n, digits) {
    if (n == null || !Number.isFinite(n)) return '–';
    if (digits === undefined) {
      const a = Math.abs(n);
      digits = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 0.1 ? 2 : a >= 0.01 ? 3 : 4;
      if (n === 0) digits = 0;
    }
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);
  }
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), Math.max(2600, 60 * String(msg).length));
  }
  function download(content, filename, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function api(path, body, asBlob) {
    const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).error || msg; } catch {}
      const e = new Error(msg); e.status = res.status; throw e;
    }
    return asBlob ? res.blob() : res.json();
  }
  // Citation list shown under AI drafts: [S1] Title, publisher year — heading ↗
  const sourcesHtml = list => list?.length ? `<div class="sources"><b>${esc(t('sources'))}</b><ol>${list.map(x =>
    `<li><span class="sid">${esc(x.id)}</span> ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)}${x.cite ? `, ${esc(x.cite)}` : ''}${x.heading ? ` <span class="muted">— ${esc(x.heading)}</span>` : ''}</li>`).join('')}</ol></div>` : '';
  // Passages retrieved for template text, which cites none of them
  const relatedHtml = list => list?.length ? `<div class="sources related"><b>${esc(t('related_reading'))}</b><ul>${list.map(x =>
    `<li>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)}${x.heading ? ` <span class="muted">— ${esc(x.heading)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
  const busy = (btn, on, label) => {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${esc(label || '')}`; }
    else { btn.disabled = false; btn.innerHTML = btn.dataset.label || btn.innerHTML; }
  };

  // ---------------------------------------------------------------- ECAM scenarios
  /** Record how the Stage 1 form set a tracked input: 'manual', 'estimate' (ECAM estimate) or 'typical' (typical value). */
  function markEntered(prefix, stage, code, origin = 'manual') {
    if (!Global || !CW.isTracked(prefix, code)) return;
    CW.setInputOrigin(state.inputStatus, idOf(Global), idOf(stage, 's'), code, origin, stage[code]);
  }
  function substageById(sc, sid) {
    for (const [, lv, sl] of CW.STAGE_KEYS) { const ss = sc?.[lv]?.[sl]?.find(x => idOf(x, 's') === sid); if (ss) return ss; }
    return null;
  }
  /** Origin and confirmation of a tracked input, compared with its current value in the assessment. */
  function inputStatusOf(aid, sid, code, fallback) {
    const ss = substageById(byId(aid), sid);
    return CW.inputState(state.inputStatus[aid], sid, code, ss ? ss[code] : fallback);
  }
  function confirmInput(aid, sid, code) {
    const ss = substageById(byId(aid), sid);
    if (ss) CW.confirmInputValue(state.inputStatus, aid, sid, code, ss[code]);
  }

  function setGwp(i) {
    state.gwpIndex = i;
    Configuration.gwp_reports_index = i;
    Cts.ct_ch4_eq.value = GWP_reports[i].ct_ch4_eq;
    Cts.ct_n2o_eq.value = GWP_reports[i].ct_n2o_eq;
    save();
  }
  function setCurrent(i) {
    state.current = Math.max(0, Math.min(i, Scenarios.length - 1));
    Global = Scenarios[state.current];
    state.ui.sel = { kind: 'general' };
    save();
  }
  function newScenario() {
    const s = new Ecam();
    const n = Scenarios.length + 1;
    s.General.Name = (state.profile?.name || (state.lang === 'id' ? 'Penilaian' : 'Assessment')) + (n > 1 ? ' ' + n : '');
    if (state.location === 'indonesia' || state.profile?.country) {
      const country = state.profile?.country || 'Indonesia';
      const c = Countries[country];
      if (c) Object.assign(s.General, { Country: country, Currency: c.currency, conv_kwh_co2: c.conv_kwh_co2, prot_con: c.prot_con, bod_pday: c.bod_pday });
    }
    if (state.profile?.population) { s.Water.ws_resi_pop = +state.profile.population || 0; s.Waste.ww_resi_pop = +state.profile.population || 0; }
    // untouched inputs of an assessment started here are defaults; imported ones stay unconfirmed
    state.inputStatus[idOf(s)] = { origin: 'new', s: {} };
    Scenarios.push(s);
    setCurrent(Scenarios.length - 1);
    return s;
  }
  function duplicateScenario() {
    const o = JSON.parse(JSON.stringify(Global));
    o.General.Name += state.lang === 'id' ? ' (salinan)' : ' (copy)';
    Scenarios.push(Ecam.from(o)); setCurrent(Scenarios.length - 1);
  }
  function deleteScenario() {
    if (Scenarios.length < 2) return;
    Scenarios.splice(state.current, 1); setCurrent(0);
  }
  /** Add checked ECAM assessments (CW.parseEcamFile), renaming copies whose name is already used. Returns the names as loaded. */
  function addAssessments(list) {
    const built = list.map(o => Ecam.from(o)); // throws before anything is added
    const names = [];
    for (const s of built) {
      s.General.Name = CW.uniqueName(s.General.Name || 'Assessment', Scenarios.map(x => x.General.Name));
      Scenarios.push(s); names.push(s.General.Name);
    }
    setCurrent(Scenarios.length - built.length);
    return names;
  }
  /** Shared by Load sample utility and Load ECAM file: all assessments in the file are added, or none. */
  function importEcamText(text) {
    const r = CW.parseEcamFile(text);
    if (!r.ok) { toast(t('import_' + r.reason)); return false; }
    let names;
    try { names = addAssessments(r.assessments); } catch { toast(t('import_not_ecam')); return false; }
    save(); toast(t('file_loaded_as').replace('{names}', names.join(', '))); render();
    return true;
  }
  async function loadSample() {
    let text;
    try { text = await fetch('/samples/utility-a-indonesia.json').then(r => { if (!r.ok) throw new Error(r.statusText); return r.text(); }); }
    catch { return toast(t('sample_unavailable')); }
    importEcamText(text);
  }

  // ---------------------------------------------------------------- persistence
  let saveTimer;
  /** Write now. Returns true only when the browser actually stored the session. */
  function persist() {
    clearTimeout(saveTimer);
    state.assessments = plain(Scenarios);
    state.assessmentMeta = Scenarios.map(metaOf);
    let r;
    if (storageLock) r = { ok: false, locked: true };
    else {
      try { r = CW.writeSession(window.localStorage, STORE, state); }
      catch (e) { r = { ok: false, error: e, quota: CW.isQuota(e) }; }
    }
    storageFail = r.ok || r.locked ? null : { quota: !!r.quota, message: r.error?.message || '' };
    $('#save-status').textContent = r.ok ? `${t('saved')} · ${new Date().toLocaleTimeString()}` : t('not_saved');
    renderStorageAlert();
    return r.ok;
  }
  function save() {
    $('#save-status').textContent = t('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  }
  function checkpoint() {
    state.assessments = plain(Scenarios);
    state.assessmentMeta = Scenarios.map(metaOf);
    const before = state.checkpoints || [];
    const snap = JSON.parse(JSON.stringify({ ...state, checkpoints: undefined, chat: undefined, previous: undefined }));
    state.checkpoints = [{ at: new Date().toISOString(), view: state.ui.view, snap }, ...before].slice(0, 5);
    if (persist()) return toast(t('checkpoint_saved'));
    state.checkpoints = before; persist();
    toast(t('checkpoint_not_saved'));
  }
  const downloadJson = (text, name) => download(text, name, 'application/json');
  function renderStorageAlert() {
    const el = $('#storage-alert');
    if (!el) return;
    const lock = storageLock, fail = storageFail;
    if (!lock && !fail) { el.hidden = true; el.innerHTML = ''; return; }
    const kind = lock ? lock.kind : 'write_failed';
    const detail = lock?.kind === 'backup_failed' ? t(lock.quota ? 'storage_full' : 'storage_refused')
      : fail ? (fail.quota ? t('storage_full') : `${t('storage_refused')} ${fail.message}`) : '';
    el.innerHTML = `<div class="notice error" data-storage="${kind}"><b>${esc(t('storage_title_' + kind))}</b>
      <p>${esc(detail)} ${esc(t('storage_body_' + kind))}</p><div class="row">
      ${lock?.original ? `<button class="btn sm" data-storage-act="original">${esc(t('download_original'))}</button>` : ''}
      <button class="btn sm" data-storage-act="current">${esc(t('download_current'))}</button>
      ${lock?.original ? `<button class="btn sm danger" data-storage-act="unlock">${esc(t('save_over_original'))}</button>` : ''}
      ${fail ? `<button class="btn sm" data-storage-act="retry">${esc(t('retry_save'))}</button>` : ''}
      ${fail && state.checkpoints?.length ? `<button class="btn sm danger" data-storage-act="checkpoints">${esc(t('drop_checkpoints'))}</button>` : ''}
      </div></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-storage-act]').forEach(b => b.onclick = () => {
      const act = b.dataset.storageAct;
      if (act === 'original') downloadJson(lock.original, 'chatwater-saved-session-original.json');
      if (act === 'current') { state.assessments = plain(Scenarios); state.assessmentMeta = Scenarios.map(metaOf); downloadJson(JSON.stringify(state), 'chatwater-current-work.json'); }
      if (act === 'unlock' && confirm(t('confirm_save_over_original'))) { storageLock = null; if (persist()) toast(t('saved')); }
      if (act === 'retry' && persist()) toast(t('saved'));
      if (act === 'checkpoints' && confirm(t('confirm_drop_checkpoints'))) { state.checkpoints = []; if (persist()) toast(t('saved')); }
    });
  }

  // ---------------------------------------------------------------- freshness
  function freshness() {
    return CW.freshness({
      assessments: Scenarios.map(s => ({ id: idOf(s), revision: CW.revision(s) })),
      gwpIndex: state.gwpIndex, actionResult: state.actionResult, actionSet: state.actionSet,
      selectedActions: state.selectedActions, plan: state.plan, proposal: state.proposal,
      profile: state.profile, financing: state.financing,
    });
  }
  // assessment the saved actions (and so the plan and proposal) were made from
  const sourceAssessment = () => byId(state.actionSet?.assessmentId) || byId(state.proposal?.deps?.assessmentId) || byId(state.selectedAssessmentId);
  function staleNotice(codes, what) {
    if (!codes.length) return '';
    return `<div class="notice warn" data-stale="${what}"><b>${esc(t('outdated_' + what))}</b>
      <ul>${codes.map(c => `<li>${esc(t('stale_' + c))}</li>`).join('')}</ul>${esc(t('outdated_hint_' + what))}</div>`;
  }
  // Only schema-1 outputs can be confirmed as-is; anything outdated by a change must be regenerated.
  const onlyLegacy = codes => codes.length === 1 && codes[0] === 'legacy';
  // Saved text with an earlier version's summed-reduction sentence is flagged, never rewritten.
  const summed = () => CW.summedClaims({ plan: state.plan, proposal: state.proposal });
  const summedIn = (s, what) => what === 'plan' ? s.plan : s.proposal.length > 0;
  function summedNotice(what) {
    const s = summed();
    return `<div class="notice warn" data-summed="${what}"${summedIn(s, what) ? '' : ' hidden'}><b>${esc(t('legacy_sum_title'))}</b>
      ${what === 'proposal' ? `<span data-summed-where>${esc(s.proposal.join(', '))}.</span> ` : ''}${esc(t('legacy_sum_body'))}</div>`;
  }
  /** Re-check after an edit without re-rendering (keeps the cursor in the textarea). */
  function refreshSummed(root, what) {
    const s = summed(), el = root.querySelector(`[data-summed="${what}"]`);
    if (el) el.hidden = !summedIn(s, what);
    const where = el && el.querySelector('[data-summed-where]');
    if (where) where.textContent = s.proposal.join(', ') + '.';
  }

  // Generated text keeps the language it was written in; switching the interface never rewrites it.
  const langName = l => (l ? t('lang_' + l) : t('lang_unknown'));
  function outputLangNotice(out, what) {
    if (!out) return '';
    const line = `<p class="small muted" data-out-lang="${what}">${esc(t('output_language'))}: <b>${esc(langName(out.lang))}</b></p>`;
    if (!out.lang || out.lang === state.lang) return line;
    return line + `<div class="notice small" data-lang-differs="${what}">${esc(t('lang_differs_' + what).replaceAll('{out}', langName(out.lang)))}
      <div class="row" style="margin-top:6px"><button class="btn sm" data-regen-lang="${what}">${esc(t('regenerate_in').replace('{lang}', langName(state.lang)))}</button></div></div>`;
  }
  // Knowledge-base topics drafts rely on for funders, context and planning; empty ones are named, not implied.
  const EVIDENCE_TOPICS = ['financing', 'indonesia', 'plan'];
  function evidenceNotice() {
    const by = META.knowledge?.byTopic;
    if (!by) return '';
    const missing = EVIDENCE_TOPICS.filter(k => !by[k]);
    if (!missing.length) return '';
    const names = missing.map(k => t('topic_' + k));
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t('or')} ${names[names.length - 1]}` : names[0];
    return `<div class="notice small" data-evidence><b>${esc(t('evidence_title'))}</b> ${esc(t('evidence_body').replace('{topics}', list))}</div>`;
  }
  const genErrorNotice = what => state.ui.genError?.what === what
    ? `<div class="notice error" data-gen-error="${what}"><b>${esc(t('gen_failed_' + what))}</b> ${esc(state.ui.genError.message)}<br>${esc(t('gen_failed_kept'))}
      <button class="link" data-dismiss-error>${esc(t('dismiss'))}</button></div>` : '';
  function previousControl(what) {
    const prev = state.previous?.[what];
    return prev ? `<button class="btn" data-restore="${what}">${esc(t('restore_previous'))} <span class="muted small">(${esc(new Date(prev.at).toLocaleString())})</span></button>` : '';
  }

  async function generatePlan(btn, lang) {
    const sc = byId(state.actionSet?.assessmentId);
    if (!sc || freshness().actions.length) return toast(t('outdated_hint_actions'));
    if (state.plan && !confirm(t('confirm_replace_plan'))) return;
    busy(btn, true, t('drafting'));
    try {
      await CW.regenerate(state, 'plan', () => api('/api/plan', { actions: state.selectedActions, actionSet: state.actionSet, assessment: plain(sc), meta: metaOf(sc), gwpIndex: state.gwpIndex, profile: state.profile, lang }));
      state.ui.genError = null;
    } catch (err) { state.ui.genError = { what: 'plan', message: err.message }; }
    save(); render();
  }
  async function generateProposal(btn, lang) {
    const now = freshness();
    if (now.actions.length || now.plan.length) return toast(t(now.actions.length ? 'outdated_hint_actions' : 'outdated_hint_plan'));
    if (summed().plan) return toast(t('legacy_sum_title') + ' ' + t('legacy_sum_body'));
    const sc = sourceAssessment() || Global;
    const f = state.financing;
    if (state.proposal && !confirm(t('confirm_replace_proposal'))) return;
    busy(btn, true, t('drafting'));
    try {
      await CW.regenerate(state, 'proposal', () => api('/api/proposal', {
        route: f.route, customFramework: f.customFramework, guideText: f.guideText,
        actions: state.selectedActions, actionSet: state.actionSet, plan: state.plan, profile: state.profile,
        assessment: plain(sc), meta: metaOf(sc), gwpIndex: state.gwpIndex, lang,
      }));
      state.ui.genError = null;
      return go('finance:draft');
    } catch (err) { state.ui.genError = { what: 'proposal', message: err.message }; }
    save(); render();
  }

  // ---------------------------------------------------------------- shell
  function applyShell() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === state.lang));
    document.querySelectorAll('[data-loc]').forEach(b => b.classList.toggle('on', b.dataset.loc === state.location));
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === state.ui.view.split(':')[0]));
    const f = freshness();
    const staleTab = { actions: f.options.length || f.actions.length, plan: f.plan.length, finance: f.proposal.length };
    document.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('stale', !!staleTab[b.dataset.tab]); b.title = staleTab[b.dataset.tab] ? t('tab_outdated') : ''; });
    $('#ai-chip').textContent = t(META.ai ? 'ai_chip_on' : 'ai_chip_off');
    $('#ai-chip').classList.toggle('off', !META.ai);
    $('#profile-chip').textContent = state.profile?.name ? `${state.profile.name}${state.profile.location ? ' · ' + state.profile.location : ''}` : '';
    $('#chat-input').placeholder = t('chat_placeholder');
    $('#chat').classList.toggle('collapsed', !state.ui.chatOpen);
    $('#chat-toggle').textContent = state.ui.chatOpen ? '–' : '+';
  }

  function go(view) { state.ui.view = view; save(); render(); window.scrollTo({ top: 0 }); }

  const VIEWS = {
    'assess:choose': viewChoose,
    'assess:entry': root => CWForm.renderEntry(root),
    'assess:results': root => CWForm.renderResults(root),
    'actions:select': viewActionsSelect,
    'actions:compare': viewActionsCompare,
    'plan': viewPlan,
    'finance': viewFinance,
    'finance:draft': viewDraft,
  };

  function render() {
    applyShell();
    const root = document.createElement('div');
    $('#view').replaceChildren(root);
    (VIEWS[state.ui.view] || viewChoose)(root);
    renderChat();
  }

  // ---------------------------------------------------------------- stage 1: choose module + profile
  function viewChoose(root) {
    root.innerHTML = `
      <div class="page-head"><h1>${esc(t('choose_module'))}</h1><p class="muted">${esc(t('choose_module_sub'))}</p></div>
      <div class="card"><h2>${esc(t('ecam_available'))}</h2><p>${esc(t('ecam_desc'))}</p>
        <button class="btn primary" data-go="assess:entry">ECAM</button>
        <a class="btn" href="https://climatesmartwater.org/ecam/" target="_blank" rel="noopener" style="margin-left:6px">climatesmartwater.org/ecam ↗</a></div>
      <div class="card muted-card"><h2>${esc(t('later_modules'))}</h2>
        <p><b>CREAT</b> · ${esc(t('creat_desc'))}</p>
        <p style="margin:0"><b>WHO</b> · ${esc(t('who_desc'))}</p></div>
      <div class="card"><div class="row"><div class="grow"><h3>${esc(t('profile_title'))}</h3>
        <p class="muted small" style="margin:0">${state.profile?.name ? esc(profileLine()) : esc(t('profile_missing'))}</p></div>
        <button class="btn" data-act="profile">${esc(t('upload_profile'))}</button></div></div>
      <div class="actions-row"><button class="btn primary" data-go="assess:entry">${esc(t('start_assessment'))}</button></div>`;
    root.querySelector('[data-act=profile]').onclick = openProfile;
  }
  function profileLine() {
    const p = state.profile || {};
    return [p.name, p.location, p.country, p.service_type && t('p_type_' + p.service_type), p.served && `${fmt(+p.served)} ${state.lang === 'id' ? 'jiwa terlayani' : 'people served'}`].filter(Boolean).join(' · ');
  }

  const PROFILE_FIELDS = [
    ['name', 'p_name', 'text'], ['location', 'p_location', 'text'], ['country', 'p_country', 'country'],
    ['service_type', 'p_type', 'type'], ['population', 'p_pop', 'number'], ['served', 'p_served', 'number'],
    ['connections', 'p_conn', 'number'], ['volume', 'p_volume', 'number'], ['staff', 'p_staff', 'number'],
    ['contact', 'p_contact', 'text'], ['notes', 'p_notes', 'textarea'],
  ];
  function openProfile() {
    const p = state.profile || { country: state.location === 'indonesia' ? 'Indonesia' : '' };
    const field = ([k, lab, type]) => {
      const v = esc(p[k] ?? '');
      let input;
      if (type === 'country') input = `<select name="${k}"><option value=""></option>${Object.keys(Countries).map(c => `<option ${c === p[k] ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
      else if (type === 'type') input = `<select name="${k}">${['water', 'ww', 'both'].map(o => `<option value="${o}" ${p[k] === o ? 'selected' : ''}>${esc(t('p_type_' + o))}</option>`).join('')}</select>`;
      else if (type === 'textarea') input = `<textarea class="field" name="${k}" rows="3">${v}</textarea>`;
      else input = `<input type="${type}" name="${k}" value="${v}" ${type === 'number' ? 'step="any" min="0"' : ''}>`;
      return `<label class="field"${type === 'textarea' ? ' style="grid-column:1/-1"' : ''}><span>${esc(t(lab))}</span>${input}</label>`;
    };
    const m = $('#modal');
    m.innerHTML = `<form class="box" id="profile-form"><h2>${esc(t('profile_title'))}</h2><p class="muted">${esc(t('profile_sub'))}</p>
      <div class="row" style="margin-bottom:12px"><label class="btn sm">${esc(t('p_upload'))}<input type="file" id="profile-file" accept=".csv,.json" hidden></label>
        <button type="button" class="link" id="profile-template">${esc(t('p_template'))}</button></div>
      <div class="grid2">${PROFILE_FIELDS.map(field).join('')}</div>
      <div class="actions-row"><button type="button" class="btn" id="profile-cancel">${esc(t('cancel'))}</button><button class="btn primary">${esc(t('p_apply'))}</button></div></form>`;
    m.hidden = false;
    $('#profile-cancel').onclick = () => (m.hidden = true);
    $('#profile-template').onclick = () => download('field,value\n' + PROFILE_FIELDS.map(([k]) => `${k},`).join('\n') + '\n', 'utility-profile-template.csv', 'text/csv');
    $('#profile-file').onchange = e => {
      const f = e.target.files[0];
      e.target.value = ''; // the same file can be chosen again
      if (!f) return;
      f.text().then(txt => {
        let data = {};
        if (/\.json$/i.test(f.name)) {
          const r = CW.parseProfileJson(txt);
          if (!r.ok) return toast(t('profile_' + r.reason));
          data = r.profile;
        } else txt.split(/\r?\n/).slice(1).forEach(line => {
          const i = line.indexOf(','); if (i < 0) return;
          data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
        });
        const form = $('#profile-form');
        let filled = 0;
        for (const [k] of PROFILE_FIELDS) if (data[k] != null && form.elements[k]) { form.elements[k].value = data[k]; filled++; }
        toast(t(filled ? 'profile_filled' : 'profile_no_profile_fields'));
      }).catch(() => toast(t('profile_not_json')));
    };
    $('#profile-form').onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.profile = Object.fromEntries(PROFILE_FIELDS.map(([k]) => [k, String(fd.get(k) ?? '').trim()]));
      // reuse the profile in the current assessment where it is still empty
      if (Global) {
        if (/^(Untitled assessment|Assessment|Penilaian)( \d+)?$/.test(Global.General.Name) && state.profile.name) Global.General.Name = state.profile.name;
        const c = Countries[state.profile.country];
        if (c && !Global.General.Country) Object.assign(Global.General, { Country: state.profile.country, Currency: c.currency, conv_kwh_co2: c.conv_kwh_co2, prot_con: c.prot_con, bod_pday: c.bod_pday });
        if (!Global.Water.ws_resi_pop && +state.profile.population) Global.Water.ws_resi_pop = +state.profile.population;
        if (!Global.Waste.ww_resi_pop && +state.profile.population) Global.Waste.ww_resi_pop = +state.profile.population;
      }
      m.hidden = true; save(); toast(t('p_saved')); render();
    };
  }

  function finishAssessment() {
    state.finished[idOf(Global)] = new Date().toISOString();
    state.selectedAssessmentId = idOf(Global);
    save(); toast(t('finished'));
    go('actions:select');
  }

  // ---------------------------------------------------------------- stage 2: actions
  function summaryOf(sc) {
    const g = sc.TotalGHG();
    const rows = CWForm.stageTotals(sc).sort((a, b) => b.total - a.total);
    const top = rows[0];
    return `${fmt(g.total / 1000)} tCO₂eq · ${fmt(sc.TotalNRG())} kWh` + (top && top.total ? ` · ${t('top_source')}: ${stageLabel(top.prefix)} (${fmt(100 * top.total / g.total, 0)}%)` : '');
  }

  function viewActionsSelect(root) {
    if (!Scenarios.some(s => s.TotalGHG().total > 0)) {
      root.innerHTML = `<div class="page-head"><h1>${esc(t('identify_title'))}</h1></div><div class="notice warn">${esc(t('no_assessments'))}</div>
        <button class="btn primary" data-go="assess:entry">${esc(t('tab_assess'))}</button>`;
      return;
    }
    if (!byId(state.selectedAssessmentId)) state.selectedAssessmentId = idOf(Global);
    const savedFrom = byId(state.actionSet?.assessmentId);
    root.innerHTML = `<div class="page-head"><h1>${esc(t('identify_title'))}</h1><p class="muted">${esc(t('identify_sub'))}</p></div>
      ${state.actionResult?.legacy ? `<div class="notice warn">${esc(t('legacy_options'))}</div>` : ''}
      ${savedFrom && idOf(savedFrom) !== state.selectedAssessmentId ? `<div class="notice small">${esc(t('actions_saved_for'))}: <b>${esc(savedFrom.General.Name)}</b></div>` : ''}
      <div class="card result-list">${Scenarios.map(s => `<label><input type="radio" name="asel" value="${esc(idOf(s))}" ${idOf(s) === state.selectedAssessmentId ? 'checked' : ''}>
        <div><b>${esc(s.General.Name)}</b> <span class="muted small">${esc(s.General.AssessmentPeriodStart)} – ${esc(s.General.AssessmentPeriodEnd)}${state.finished[idOf(s)] ? ' · ✓' : ''}</span><br>
        <span class="small">${esc(summaryOf(s))}</span></div></label>`).join('')}</div>
      <div class="actions-row"><button class="btn primary" id="show-options">${esc(t('show_options'))}</button></div>`;
    root.querySelectorAll('[name=asel]').forEach(r => r.onchange = () => { state.selectedAssessmentId = r.value; save(); });
    root.querySelector('#show-options').onclick = async e => {
      busy(e.target, true, t('show_options'));
      try {
        const sc = byId(state.selectedAssessmentId) || Global;
        const meta = metaOf(sc), aid = meta.id;
        const res = await api('/api/actions', { assessment: plain(sc), meta, gwpIndex: state.gwpIndex, lang: state.lang });
        state.actionLabels[aid] = CW.assignLabels(res.options, state.actionLabels[aid]);
        const offered = new Set(res.options.map(o => o.key));
        let base = state.actionResult?.assessmentId === aid && !state.actionResult.legacy ? state.selectedKeys
          : state.actionSet?.assessmentId === aid && !state.actionSet.legacy ? state.selectedActions.map(a => a.key) : [];
        let review = [];
        if (state.actionSet?.legacy && (state.actionSet.assessmentId === aid || !state.actionSet.assessmentId)) {
          // without a proven source assessment, nothing is mapped: every old selection goes to review
          const m = state.actionSet.assessmentId === aid ? CW.mapLegacy(state.selectedActions, res.options)
            : { mapped: [], review: state.selectedActions.filter(a => a.rule !== 'baseline') };
          base = m.mapped.map(x => x.key);
          m.mapped.forEach(x => { if (x.from.notes && !state.actionNotes[x.key]) state.actionNotes[x.key] = x.from.notes; });
          review = m.review.map(a => a.title);
        } else {
          const known = [...(state.actionResult?.options || []), ...state.selectedActions];
          review = base.filter(k => !offered.has(k)).map(k => known.find(o => o.key === k)?.title || k);
        }
        state.selectedKeys = base.filter(k => offered.has(k));
        state.actionReview = review;
        state.actionResult = { assessmentId: aid, assessmentName: sc.General.Name, basis: res.basis, options: res.options, assumptions: res.assumptions, checks: res.checks || [] };
        go('actions:compare');
      } catch (err) { toast(t('error') + ': ' + err.message); busy(e.target, false); }
    };
  }

  const expectedCell = o => DC.benefit(o, { t, L, esc, fmt });

  // Cards whose details the user opened in this page session (not saved)
  const openCards = new Set();
  function cardCtx(aid) {
    return {
      t, L, esc, fmt, stageLabel,
      labelOf: code => rich(tE(code + '_descr') || tE(code) || code),
      unitView: code => CW.unitView(Units, Info, byId(aid) || Global, code),
      status: (sid, code, value) => inputStatusOf(aid, sid, code, value),
      substageName: sid => substageById(byId(aid), sid)?.name || null,
    };
  }
  const safeKg = fn => { try { const v = fn(); return Number.isFinite(v) ? v : null; } catch { return null; } };
  /** Largest assessed contributor of one assessment, from ECAM's first-level source outputs (AS.COMPONENTS). */
  function contributorOf(sc) {
    if (!sc) return null;
    const rows = [], subTotals = [];
    for (const [p, lv, sl] of CW.STAGE_KEYS) for (const ss of sc[lv][sl]) {
      const sid = idOf(ss, 's');
      subTotals.push({ sid, kg: safeKg(() => ss[p + '_KPI_GHG']().total) });
      for (const c of AS.COMPONENTS[p]) rows.push({ prefix: p, sid, name: ss.name, component: c, kg: safeKg(() => ss[`${p}_KPI_GHG_${c}`]().total) });
    }
    return AS.largestContributor(rows, subTotals, safeKg(() => sc.TotalGHG().total));
  }
  /** Action labels per substage ID, only while the stored options are current for this assessment. */
  function relatedActions(sc) {
    const r = state.actionResult;
    if (!sc || !r || r.legacy || r.assessmentId !== idOf(sc)) return { status: 'none', bySid: {} };
    if (freshness().options.length) return { status: 'outdated', bySid: {} };
    const bySid = {};
    for (const o of r.options) {
      const sid = DC.optionSid(o);
      if (o.rule !== 'baseline' && sid && sid !== 'utility') (bySid[sid] = bySid[sid] || []).push(o.id);
    }
    return { status: 'ok', bySid };
  }
  /** Open the Stage 1 section an option refers to, in the assessment the option came from. */
  function gotoSource(key) {
    const o = state.actionResult?.options.find(x => x.key === key);
    const d = o && AS.describe(o);
    const sc = byId(d?.assessmentId);
    if (!sc) return toast(t('goto_missing_assessment'));
    let sel = null;
    if (d.location?.sid) {
      const [, lv, sl] = CW.STAGE_KEYS.find(([p]) => p === d.location.prefix) || [];
      const index = lv ? sc[lv][sl].findIndex(ss => idOf(ss, 's') === d.location.sid) : -1;
      if (index < 0) return toast(t('goto_missing_substage'));
      sel = { kind: 'ss', prefix: d.location.prefix, index };
    }
    if (Scenarios.indexOf(sc) !== state.current) setCurrent(Scenarios.indexOf(sc));
    if (sel) state.ui.sel = sel;
    toast(t('goto_shown').replace('{name}', sc.General.Name));
    go(sel ? 'assess:entry' : 'assess:results');
  }

  function viewActionsCompare(root) {
    const r = state.actionResult;
    if (!r || r.legacy) return go('actions:select');
    const f = freshness();
    const optionsStale = f.options.length > 0;
    const showDetails = !!state.ui.showDetails;
    const ctx = cardCtx(r.assessmentId);
    const explainHtml = o => o.rule === 'baseline' ? '' : `<div class="row" style="margin-top:6px"><button class="btn sm" data-explain="${esc(o.key)}" ${META.ai ? '' : `disabled title="${esc(t('ai_off_short'))}"`}>${esc(t('explain_ai'))}</button>${META.ai ? '' : ` <span class="small muted">${esc(t('ai_off_short'))}</span>`}</div>
      ${state.explanations[o.key] ? `<div class="ai-text">${esc(state.explanations[o.key])}${sourcesHtml(state.explanationSources?.[o.key])}</div>` : ''}`;
    const sort = AS.MEASURES[state.ui.actionSort] ? state.ui.actionSort : 'original';
    const cards = AS.sortOptions(r.options, sort).map(o => DC.card(o, ctx, {
      selected: state.selectedKeys.includes(o.key), note: state.actionNotes[o.key] || '',
      open: showDetails || openCards.has(o.key), checks: r.checks, explainHtml: explainHtml(o),
      measure: sort === 'original' ? null : sort,
    })).join('');
    const review = state.actionReview || [];
    const source = byId(r.assessmentId);
    // the source assessment's current figures; while options are outdated they may no longer match the cards
    const contrib = source && !optionsStale ? DC.contributor(contributorOf(source), ctx) : '';
    const days = source ? source.Days() : null;
    root.innerHTML = `<div class="page-head"><h1>${esc(t('compare_title'))}</h1><p class="muted">${esc(t('compare_sub'))} · <b>${esc(source?.General.Name || r.assessmentName)}</b></p></div>
      ${staleNotice(f.options, 'options')}
      ${review.length ? `<div class="notice warn"><b>${esc(t('review_selection'))}</b><ul>${review.map(x => `<li>${esc(L(x))}</li>`).join('')}</ul></div>` : ''}
      ${contrib}
      ${r.checks ? DC.panel(r.checks, r.options, ctx, { open: openCards.has('__checks') }) : ''}
      <div class="row" style="margin-bottom:10px"><span class="grow small muted">${esc(t('cards_hint'))}</span>
        <label class="small row" style="gap:6px">${esc(t('sort_label'))}
          <select id="action-sort" style="width:auto">${['original', 'ghg', 'kwh'].map(k => `<option value="${k}" ${k === sort ? 'selected' : ''}>${esc(t('sort_' + k))}</option>`).join('')}</select></label>
        <button class="btn sm" id="toggle-details">${esc(showDetails ? t('hide_details') : t('details'))}</button></div>
      ${sort === 'original' ? '' : `<p class="small muted" data-sort-note="${sort}">${esc(t('sort_note').replace('{days}', fmt(days, 0)))}</p>`}
      <div class="dcards">${cards}</div>
      <div class="notice small" style="margin-top:12px"><b>${esc(t('assumptions_title'))}:</b> ${esc(Object.entries(r.assumptions).map(([k, v]) => `${k} = ${v}`).join(' · '))}</div>
      <div class="actions-row"><button class="btn" data-go="actions:select">${esc(t('back'))}</button><button class="btn primary" id="save-actions" ${optionsStale ? 'disabled' : ''}>${esc(t('save_actions'))}</button></div>`;
    root.querySelector('#toggle-details').onclick = () => { state.ui.showDetails = !showDetails; if (showDetails) openCards.clear(); save(); render(); };
    root.querySelector('#action-sort').onchange = e => { state.ui.actionSort = e.target.value; save(); render(); };
    root.querySelectorAll('[data-goto-source]').forEach(b => b.onclick = () => gotoSource(b.dataset.gotoSource));
    root.querySelectorAll('details[data-details]').forEach(d => d.ontoggle = () => { d.open ? openCards.add(d.dataset.details) : openCards.delete(d.dataset.details); });
    root.querySelectorAll('[data-confirm]').forEach(b => b.onclick = () => {
      const [sid, code] = b.dataset.confirm.split('|');
      confirmInput(r.assessmentId, sid, code); save(); render();
    });
    root.querySelectorAll('[data-confirm-check]').forEach(b => b.onclick = () => {
      const [check, sid] = b.dataset.confirmCheck.split('|');
      const c = r.checks.find(x => x.check === check && x.sid === sid);
      for (const i of c?.inputs || []) if (DC.needsConfirm(inputStatusOf(r.assessmentId, sid, i.code, i.value))) confirmInput(r.assessmentId, sid, i.code);
      save(); render();
    });
    root.querySelectorAll('[data-pick]').forEach(cb => cb.onchange = () => {
      const k = cb.dataset.pick;
      state.selectedKeys = cb.checked ? [...new Set([...state.selectedKeys, k])] : state.selectedKeys.filter(x => x !== k);
      cb.closest('.dcard').classList.toggle('sel', cb.checked); save();
    });
    root.querySelectorAll('[data-note]').forEach(tx => tx.oninput = () => { state.actionNotes[tx.dataset.note] = tx.value; save(); });
    root.querySelectorAll('[data-explain]').forEach(b => b.onclick = async () => {
      const o = r.options.find(x => x.key === b.dataset.explain);
      const sc = byId(r.assessmentId);
      if (!sc) return toast(t('stale_assessment_missing'));
      busy(b, true, t('thinking'));
      try {
        const res = await api('/api/actions/explain', { option: { ...o, notes: state.actionNotes[o.key] }, assessment: plain(sc), gwpIndex: state.gwpIndex, lang: state.lang });
        state.explanations[o.key] = res.text; state.explanationSources = { ...(state.explanationSources || {}), [o.key]: res.sources || [] }; save(); render();
      } catch (err) { busy(b, false); toast(err.status === 503 ? t('ai_off_note') : t('error') + ': ' + err.message); }
    });
    root.querySelector('#save-actions').onclick = () => {
      if (freshness().options.length) return toast(t('outdated_hint_options'));
      const chosen = r.options.filter(o => o.rule !== 'baseline' && state.selectedKeys.includes(o.key)).map(o => ({ ...o, notes: state.actionNotes[o.key] || '' }));
      if (!chosen.length) return toast(t('no_actions'));
      // plan and proposal are kept; freshness marks them outdated if this selection differs
      state.selectedActions = chosen;
      state.actionSet = { ...r.basis, savedAt: new Date().toISOString() };
      state.actionReview = [];
      toast(persist() ? t('actions_saved') : t('not_saved_kept_in_page')); go('plan');
    };
  }

  // ---------------------------------------------------------------- stage 3: plan
  function recomputeSchedule(plan) {
    const byId = Object.fromEntries(plan.tasks.map(k => [k.id, k]));
    for (const k of plan.tasks) {
      k.start_week = (k.depends_on || []).reduce((m, d) => byId[d] ? Math.max(m, byId[d].start_week + byId[d].weeks) : m, 0);
    }
    plan.total_weeks = plan.tasks.reduce((m, k) => Math.max(m, k.start_week + k.weeks), 0);
  }

  function viewPlan(root) {
    if (!state.selectedActions.length) {
      root.innerHTML = `<div class="page-head"><h1>${esc(t('plan_title'))}</h1></div><div class="notice warn">${esc(t('no_actions'))}</div><button class="btn primary" data-go="actions:select">${esc(t('tab_actions'))}</button>`;
      return;
    }
    const p = state.plan;
    const fr = freshness();
    const acts = state.selectedActions.map(a => `<li><b>${esc(a.id)}</b> ${esc(L(a.title))} — <span class="muted">${expectedCell(a)}</span></li>`).join('');
    let body = '';
    if (p) {
      const max = p.total_weeks || 1;
      body = `<div class="card"><h2>${esc(t('project_summary'))}</h2>
          ${p.ai === false ? `<div class="notice small">${esc(t('ai_off_note'))}</div>` : ''}
          <div class="section-edit"><textarea id="plan-summary">${esc(p.summary || '')}</textarea></div>${p.ai === false ? relatedHtml(p.related || p.sources) : sourcesHtml(p.sources)}</div>
        <div class="card" style="overflow:auto"><div class="row"><h2 class="grow">${esc(t('tasks'))}</h2><span class="muted">${esc(t('total_duration'))}: <b>${p.total_weeks}</b> ${esc(t('weeks_unit'))}</span></div>
          <table class="data"><thead><tr><th>ID</th><th>${esc(t('task'))}</th><th>${esc(t('owner'))}</th><th class="num">${esc(t('start_week'))}</th><th class="num">${esc(t('weeks'))}</th><th>${esc(t('depends'))}</th></tr></thead><tbody>
          ${p.tasks.map((k, i) => `<tr><td>${esc(k.id)}</td><td><span class="muted small">${esc(k.action_id)} · ${esc(k.action)}</span><br>${esc(k.name)}
              ${state.ui.planDetails ? `<div class="gantt"><div class="gbar" style="margin-left:${100 * k.start_week / max}%;width:${Math.max(1, 100 * k.weeks / max)}%"></div></div>` : ''}</td>
            <td><input type="text" data-owner="${i}" value="${esc(k.owner)}"></td><td class="num">${k.start_week}</td>
            <td><input type="number" min="0" step="1" data-weeks="${i}" value="${k.weeks}" style="width:70px"></td><td>${esc((k.depends_on || []).join(', '))}</td></tr>`).join('')}
          </tbody></table></div>`;
    }
    root.innerHTML = `<div class="page-head"><h1>${esc(t('plan_title'))}</h1><p class="muted">${esc(t('plan_sub'))}</p></div>
      ${staleNotice(fr.actions, 'actions')}
      ${staleNotice(fr.plan, 'plan')}
      ${p ? summedNotice('plan') : ''}
      ${genErrorNotice('plan')}
      ${p && onlyLegacy(fr.plan) && !fr.actions.length ? `<div class="actions-row" style="margin-top:0"><button class="btn" id="plan-reviewed">${esc(t('mark_reviewed'))}</button></div>` : ''}
      ${outputLangNotice(p, 'plan')}
      ${evidenceNotice()}
      <div class="card"><ul style="margin:0;padding-left:18px">${acts}</ul></div>
      ${body}
      <div class="actions-row">
        <button class="btn" data-go="actions:compare">${esc(t('back'))}</button>
        ${previousControl('plan')}
        <button class="btn" id="gen-plan" ${fr.actions.length ? 'disabled' : ''}>${esc(p ? t('regenerate') : t('generate_plan'))}</button>
        ${p ? `<button class="btn" id="plan-details">${esc(t('review_details'))}</button><button class="btn primary" id="save-plan">${esc(t('save_plan'))}</button>` : ''}
      </div>`;
    root.querySelector('#gen-plan').onclick = e => generatePlan(e.target, p?.lang || state.lang);
    const regenLang = root.querySelector('[data-regen-lang=plan]');
    if (regenLang) regenLang.onclick = e => generatePlan(e.target, state.lang);
    if (!p) return;
    const reviewed = root.querySelector('#plan-reviewed');
    if (reviewed) reviewed.onclick = () => {
      const sc = byId(state.actionSet?.assessmentId);
      if (!sc) return toast(t('stale_assessment_missing'));
      p.deps = CW.planDeps({ assessmentId: idOf(sc), assessment: sc, gwpIndex: state.gwpIndex, actions: state.selectedActions, profile: state.profile });
      save(); render();
    };
    root.querySelector('#plan-summary').oninput = e => { p.summary = e.target.value; save(); refreshSummed(root, 'plan'); };
    root.querySelectorAll('[data-owner]').forEach(i => i.oninput = () => { p.tasks[+i.dataset.owner].owner = i.value; save(); });
    root.querySelectorAll('[data-weeks]').forEach(i => i.onchange = () => { p.tasks[+i.dataset.weeks].weeks = Math.max(0, parseInt(i.value, 10) || 0); recomputeSchedule(p); save(); render(); });
    root.querySelector('#plan-details').onclick = () => { state.ui.planDetails = !state.ui.planDetails; save(); render(); };
    root.querySelector('#save-plan').onclick = () => { toast(persist() ? t('plan_saved') : t('not_saved_kept_in_page')); go('finance'); };
  }

  // ---------------------------------------------------------------- stage 4: financing
  function viewFinance(root) {
    const f = state.financing;
    const fr = freshness();
    const upstreamStale = fr.actions.length > 0 || fr.plan.length > 0;
    const sums = summed();
    const exportBlocked = upstreamStale || fr.proposal.length > 0 || sums.plan || sums.proposal.length > 0;
    const card = (route, title, desc, btn) => `<div class="card pick ${f.route === route ? 'on' : ''}" data-route="${route}"><h2>${esc(title)}</h2><p>${esc(desc)}</p>${btn}</div>`;
    root.innerHTML = `<div class="page-head"><h1>${esc(t('finance_title'))}</h1><p class="muted">${esc(t('finance_sub'))}</p></div>
      ${!state.plan ? `<div class="notice warn">${esc(t('no_plan'))}</div>` : ''}
      ${staleNotice(fr.actions, 'actions')}${staleNotice(fr.plan, 'plan')}${staleNotice(fr.proposal, 'proposal')}${genErrorNotice('proposal')}
      ${state.plan ? summedNotice('plan') : ''}${state.proposal ? summedNotice('proposal') : ''}
      ${META.ai ? '' : `<div class="notice small">${esc(t('ai_off_note'))}</div>`}${evidenceNotice()}
      ${card('general', t('general_proposal'), t('general_desc'), `<button class="btn ${f.route === 'general' ? 'primary' : ''}">${esc(t('use_general'))}</button>`)}
      ${card('custom', t('tailor'), t('tailor_desc'), `<label class="btn ${f.route === 'custom' ? 'primary' : ''}">${esc(t('add_guide'))}<input type="file" id="guide-file" accept=".pdf,.docx,.txt,.md" hidden></label>
        ${f.guideName ? `<span class="small muted" style="margin-left:8px">${esc(t('guide_loaded'))}: ${esc(f.guideName)}</span>` : ''}
        ${f.customFramework?.requirements?.length ? `<div class="notice small" style="margin-top:10px"><b>${esc(t('requirements'))}</b><ul>${f.customFramework.requirements.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${f.customFramework?._note ? `<p class="small muted" style="margin-top:8px">${esc(f.customFramework._note)}</p>` : ''}`)}
      ${card('gcf', t('gcf'), t('gcf_desc'), `<button class="btn ${f.route === 'gcf' ? 'primary' : ''}">${esc(t('use_gcf'))}</button><p class="small muted" style="margin:8px 0 0">${esc(t('gcf_note'))}</p>`)}
      <div class="actions-row"><button class="btn" data-go="plan">${esc(t('back'))}</button>
        ${state.proposal ? `<button class="btn" data-go="finance:draft">${esc(t('open_draft'))}</button>` : ''}
        ${previousControl('proposal')}
        <button class="btn" id="dl-all" ${exportBlocked ? 'disabled' : ''}>${esc(t('download_all'))}</button>
        <button class="btn primary" id="draft" ${upstreamStale ? 'disabled' : ''}>${esc(state.proposal ? t('regenerate_draft') : t('review_draft'))}</button></div>`;
    root.querySelectorAll('[data-route]').forEach(c => c.onclick = e => {
      if (e.target.closest('label')) { f.route = c.dataset.route; save(); return; }
      f.route = c.dataset.route; save(); render();
    });
    root.querySelector('#guide-file').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      f.route = 'custom';
      const lbl = e.target.closest('label'); busy(lbl, true, file.name);
      try {
        const buf = await file.arrayBuffer();
        let bin = ''; const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        const res = await api('/api/guide/parse', { filename: file.name, base64: btoa(bin), lang: state.lang });
        Object.assign(f, { guideName: file.name, guideText: res.guideText, customFramework: res.framework });
        save(); render();
      } catch (err) { busy(lbl, false); toast(t('error') + ': ' + err.message); }
    };
    root.querySelector('#draft').onclick = e => generateProposal(e.target, state.proposal?.lang || state.lang);
    root.querySelector('#dl-all').onclick = e => downloadAll(e.target);
  }

  function exportState() {
    return { ...plain(state), assessments: plain(Scenarios), assessmentMeta: Scenarios.map(metaOf), chat: undefined, checkpoints: undefined, legacy: undefined, previous: undefined };
  }
  // mirrors the server check so the user sees why before a request is made
  function exportBlockedReason() {
    const f = freshness();
    for (const [k, what] of [['actions', 'actions'], ['plan', 'plan'], ['proposal', 'proposal']]) if (f[k].length) return t('outdated_hint_' + what);
    const s = summed();
    if (s.plan || s.proposal.length) return t('legacy_sum_title') + ' ' + t('legacy_sum_body');
    return '';
  }
  async function downloadAll(btn) {
    const why = exportBlockedReason();
    if (why) return toast(why);
    busy(btn, true, t('download_all'));
    try {
      const blob = await api('/api/export', exportState(), true);
      download(blob, `${(state.profile?.name || 'chatwater').replace(/[^\w-]+/g, '_')}-chatwater-files.zip`);
    } catch (err) { toast(t('error') + ': ' + err.message); }
    busy(btn, false);
  }

  function viewDraft(root) {
    const p = state.proposal;
    if (!p) return go('finance');
    const fr = freshness();
    const outdated = fr.actions.length || fr.plan.length || fr.proposal.length;
    const sums = () => { const s = summed(); return s.plan || s.proposal.length > 0; };
    const blocked = outdated || sums();
    root.innerHTML = `<div class="page-head"><h1>${esc(t('proposal_title'))}${fr.proposal.length ? ` <span class="badge-outdated">${esc(t('outdated_badge'))}</span>` : ''}</h1><p class="muted">${esc(p.title)}</p></div>
      ${staleNotice(fr.proposal, 'proposal')}
      ${summedNotice('proposal')}
      ${state.plan ? summedNotice('plan') : ''}
      ${genErrorNotice('proposal')}
      ${onlyLegacy(fr.proposal) && !fr.actions.length && !fr.plan.length ? `<div class="actions-row" style="margin-top:0"><button class="btn" id="proposal-reviewed">${esc(t('mark_reviewed'))}</button></div>` : ''}
      ${outputLangNotice(p, 'proposal')}
      ${p.lang && state.plan?.lang && p.lang !== state.plan.lang ? `<div class="notice small warn" data-mixed-lang>${esc(t('mixed_lang').replaceAll('{proposal}', langName(p.lang)).replaceAll('{plan}', langName(state.plan.lang)))}</div>` : ''}
      ${p.ai_failed?.length ? `<div class="notice warn" data-ai-failed><b>${esc(t('ai_partial_title'))}</b> ${esc(t('ai_partial_body'))}<ul>${p.ai_failed.map(x => `<li>${esc(x.title)}</li>`).join('')}</ul></div>`
        : p.ai === false ? `<div class="notice small">${esc(t('ai_off_note'))}</div>` : ''}
      ${evidenceNotice()}
      ${p.sections.map((s, i) => `<div class="card section-edit"><h2>${esc(s.title)}${s.ai === false || (s.ai === undefined && p.ai === false) ? ` <span class="badge-template">${esc(t('template_badge'))}</span>` : ''}</h2><div class="guidance">${esc(s.guidance || '')}</div><textarea data-sec="${i}">${esc(s.text)}</textarea>${s.ai === false || (s.ai === undefined && p.ai === false) ? relatedHtml(s.related || s.sources) : sourcesHtml(s.sources)}</div>`).join('')}
      <div class="actions-row"><button class="btn" data-go="finance">${esc(t('back'))}</button>
        ${previousControl('proposal')}
        <button class="btn" id="dl-word" ${blocked ? 'disabled' : ''}>${esc(t('download_word'))}</button>
        <button class="btn primary" id="dl-all" ${blocked ? 'disabled' : ''}>${esc(t('download_all'))}</button></div>`;
    root.querySelectorAll('[data-sec]').forEach(tx => tx.oninput = () => {
      p.sections[+tx.dataset.sec].text = tx.value; save();
      refreshSummed(root, 'proposal');
      const off = !!(outdated || sums());
      root.querySelectorAll('#dl-word, #dl-all').forEach(b => { b.disabled = off; });
    });
    const regenLang = root.querySelector('[data-regen-lang=proposal]');
    if (regenLang) regenLang.onclick = e => generateProposal(e.target, state.lang);
    const reviewed = root.querySelector('#proposal-reviewed');
    if (reviewed) reviewed.onclick = () => {
      const sc = sourceAssessment();
      if (!sc) return toast(t('stale_assessment_missing'));
      p.deps = CW.proposalDeps({ assessmentId: idOf(sc), assessment: sc, gwpIndex: state.gwpIndex, actions: state.selectedActions, plan: state.plan, profile: state.profile, financing: state.financing });
      save(); render();
    };
    root.querySelector('#dl-word').onclick = async e => {
      const why = exportBlockedReason();
      if (why) return toast(why);
      busy(e.target, true, t('download_word'));
      try { download(await api('/api/export/docx', exportState(), true), 'proposal.docx'); }
      catch (err) { toast(t('error') + ': ' + err.message); }
      busy(e.target, false);
    };
    root.querySelector('#dl-all').onclick = e => downloadAll(e.target);
  }

  // ---------------------------------------------------------------- chat
  function renderChat() {
    const log = $('#chat-log');
    const intro = `<div class="msg bot">${esc(t('chat_intro'))}</div>`;
    log.innerHTML = intro + state.chat.map(m => `<div class="msg ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.content)}${m.sources?.length ? `<div class="src">${esc(t('sources'))}: ${esc(m.sources.join('; '))}</div>` : ''}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }
  async function askChat(text, focus) {
    if (!text.trim()) return;
    state.ui.chatOpen = true; applyShell();
    state.chat.push({ role: 'user', content: text });
    renderChat();
    const log = $('#chat-log');
    const pending = document.createElement('div'); pending.className = 'msg bot'; pending.innerHTML = `<span class="spin"></span> ${esc(t('thinking'))}`;
    log.appendChild(pending); log.scrollTop = log.scrollHeight;
    try {
      const sc = (state.ui.view.startsWith('assess') ? Global : sourceAssessment()) || Global;
      const res = await api('/api/chat', {
        messages: state.chat.filter(m => !m.local).map(({ role, content }) => ({ role, content })),
        lang: state.lang, stage: state.ui.view, focus: focus || '',
        assessment: JSON.parse(JSON.stringify(sc)), gwpIndex: state.gwpIndex,
        actions: state.selectedActions, plan: state.plan, profile: state.profile,
      });
      const content = res.ai === false ? (res.reply ? `${t('chat_no_ai')}\n\n${res.reply}` : t('chat_no_match')) : res.reply;
      state.chat.push({ role: 'assistant', content, sources: res.sources, local: res.ai === false });
    } catch (err) {
      state.chat.push({ role: 'assistant', content: `${t('error')}: ${err.message}`, local: true });
    }
    state.chat = state.chat.slice(-40);
    save(); renderChat();
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', e => {
    const restore = e.target.closest('[data-restore]');
    if (restore) {
      const what = restore.dataset.restore;
      if (!confirm(t('confirm_restore_' + what))) return;
      if (CW.restoreVersion(state, what)) { state.ui.genError = null; toast(persist() ? t('restored') : t('not_saved_kept_in_page')); render(); }
      return;
    }
    if (e.target.closest('[data-dismiss-error]')) { state.ui.genError = null; save(); return render(); }
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); return go(g.dataset.go); }
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      const map = { assess: 'assess:choose', actions: state.actionResult && !state.actionResult.legacy ? 'actions:compare' : 'actions:select', plan: 'plan', finance: state.proposal ? 'finance:draft' : 'finance' };
      return go(map[tab.dataset.tab]);
    }
    const lang = e.target.closest('[data-lang]');
    if (lang) { state.lang = lang.dataset.lang; save(); return render(); }
    const loc = e.target.closest('[data-loc]');
    if (loc) { state.location = loc.dataset.loc; state.lang = loc.dataset.loc === 'indonesia' ? 'id' : 'en'; save(); return render(); }
  });
  $('#btn-checkpoint').onclick = checkpoint;
  $('#chat-clear').onclick = () => {
    if (!state.chat.length || !confirm(t('confirm_clear_chat'))) return;
    state.chat = []; save(); renderChat(); toast(t('chat_cleared'));
  };
  $('#chat-toggle').onclick = () => { state.ui.chatOpen = !state.ui.chatOpen; save(); applyShell(); };
  $('#chat-form').onsubmit = e => { e.preventDefault(); const v = $('#chat-input').value; $('#chat-input').value = ''; askChat(v); };
  $('#chat-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chat-form').requestSubmit(); } });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') e.target.hidden = true; });

  // ---------------------------------------------------------------- boot
  window.App = {
    get state() { return state; }, t, tE, rich, esc, fmt, L, save, toast, download, askChat, stageLabel,
    idOf, cardCtx, contributorOf, relatedActions,
    setCurrent, setGwp, newScenario, duplicateScenario, deleteScenario, loadSample, importEcamText, render, finishAssessment, markEntered,
  };

  async function boot() {
    const [en, id, health] = await Promise.all([
      fetch('/ecam/languages/en.json').then(r => r.json()),
      fetch('/i18n/ecam.id.json').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      api('/api/health').catch(() => null),
    ]);
    LANGS = { en, id };
    if (health) META = health;
    Scenarios.length = 0;
    (state.assessments || []).forEach((o, i) => {
      try { const sc = Ecam.from(o); attachMeta(sc, state.assessmentMeta?.[i]); Scenarios.push(sc); }
      catch (e) { console.warn('skip assessment', e); }
    });
    const sel = state.ui.sel;
    if (!Scenarios.length) newScenario();
    setCurrent(Math.min(state.current || 0, Scenarios.length - 1));
    state.ui.sel = sel || { kind: 'general' };
    setGwp(state.gwpIndex || 0);
    render();
    renderStorageAlert();
  }
  boot();
})();
