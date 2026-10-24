/*
 * ChatWater Resilience — app shell: state, language, routing, stages 2–4, chat.
 * ECAM objects (Ecam, Scenarios, Global, Structure, …) come from the unmodified
 * ECAM backend scripts loaded before this file.
 */
(() => {
  const workspace = new URLSearchParams(window.location.search).get('workspace');
  const STORE = workspace && /^[\w-]{1,100}$/.test(workspace) ? 'cwr.v1.workspace.'+workspace : 'cwr.v1';
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
    customActions: [], // user-proposed actions (custom-actions.js), each bound to its source assessment ID
    customLastLabel: {}, // assessment ID -> last U-label handed out, so labels of deleted actions are not reused
    plan: null, financing: { route: 'general' }, proposal: null,
    chat: [], // messages from before chats were scoped; kept and shown, never sent
    chatThreads: {}, // assessment ID -> messages about that assessment only
    checkpoints: [], explanations: {},
    inputStatus: {}, // assessment ID -> entry status of the inputs read by the covered rule checks (see CW.inputStatus)
    ui: { tab: 'assess', view: 'assess:choose', sel: { kind: 'general' }, chatOpen: true, actionSort: 'original' },
  });
  // storageLock: the saved session could not be read or backed up, so it must not be written over
  // until the user chooses to. storageFail: the last write failed (the previous save is still in place).
  let storageLock = null, storageFail = null, loaded;
  try { loaded = CW.loadSession(window.localStorage, STORE, newId); }
  catch (e) { loaded = { state: null, problem: 'read_failed', error: e, original: null }; }
  let state = Object.assign(defaults(), loaded.state || {});
  state.ui={...state.ui,reviewGenerating:false}; // A process-local request cannot survive a reload.
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
  /** True when an ECAM text is shown in English because the current language has no translation of it. */
  const tEOriginal = k => state.lang !== 'en' && !LANGS[state.lang]?.['#' + k] && !!LANGS.en['#' + k];
  const stageLabel = k => (STAGE_LABELS[state.lang] || STAGE_LABELS.en)[k] || tE(k) || k;
  const L = o => (o && typeof o === 'object') ? (o[state.lang] || o.en) : (o ?? '');
  const fmt = (n, digits) => CW.formatNumber(n, state.lang, digits);
  const fmtDate = (v, withTime) => CW.formatDate(v, state.lang, withTime);
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
  /** Server errors arrive in English with a code; other languages show the translated message and keep the detail. */
  function serverError(code, detail) {
    if (state.lang === 'en') return detail;
    const k = 'err_' + (code || 'request');
    const msg = UI[state.lang]?.[k] || t('err_request');
    return detail ? `${msg} (${t('err_detail_en')}: ${detail})` : msg;
  }
  async function api(path, body, asBlob) {
    if (body?.assessment && body.meta?.id) body.inputStatus = state.inputStatus[body.meta.id] || null;
    let res;
    try { res = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw new Error(t('err_network')); }
    if (!res.ok) {
      let msg = res.statusText, code = null;
      try { const j = await res.json(); msg = j.error || msg; code = j.code || null; } catch {}
      const e = new Error(serverError(code, msg)); e.status = res.status; e.code = code; e.detail = msg; throw e;
    }
    return asBlob ? res.blob() : res.json();
  }
  // Citation list shown under AI drafts: [S1] Title, publisher year — locator · role · passage ID. Older saved
  // outputs have no role or passage ID and show as before.
  const roleBadge = r => r ? ` <span class="badge-role" data-role="${esc(r)}">${esc(t('chat_role_' + r))}</span>` : '';
  // the locator part of a saved heading ("p. 12 — Section") in the interface language; section names stay as written
  const headingText = x => (x.locator && x.locatorLabel && String(x.heading || '').startsWith(x.locatorLabel)
    ? SN.locator(x.locator, state.lang) + x.heading.slice(x.locatorLabel.length) : x.heading);
  const sourcesHtml = list => list?.length ? `<div class="sources"><b>${esc(t('sources'))}</b><ol>${list.map(x =>
    `<li><span class="sid">${esc(x.id)}</span> ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)}${x.cite ? `, ${CV.noteHtml(x.cite, { t, esc, lang: state.lang }, 'date')}` : ''}${x.heading ? ` <span class="muted">— ${esc(headingText(x))}</span>` : ''}${roleBadge(x.role)}${x.passage_id ? ` <span class="muted small" data-passage-id>${esc(x.passage_id)}</span>` : ''}${CV.qualificationsHtml(x.review_status, [...(x.warnings || []), ...(x.caveats || []), ...(x.qualification_details || []).map(q => `${q.id}: ${q.title}: ${q.text}`)], { t, esc, lang: state.lang })}</li>`).join('')}</ol></div>` : '';
  // Passages retrieved for template text, which cites none of them
  const relatedHtml = list => list?.length ? `<div class="sources related"><b>${esc(t('related_reading'))}</b><ul>${list.map(x =>
    `<li>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)}${x.heading ? ` <span class="muted">— ${esc(headingText(x))}</span>` : ''}${roleBadge(x.role)}${CV.qualificationsHtml(x.review_status, [...(x.warnings || []), ...(x.qualification_details || []).map(q => `${q.id}: ${q.title}: ${q.text}`)], { t, esc, lang: state.lang })}</li>`).join('')}</ul></div>` : '';
  // What the library was searched for, the library build, and what the citation checks do and do not cover
  const evidenceHtml = (ev, cited) => ev?.searched ? `<div class="small muted ev-note" data-evidence data-library-build="${esc(ev.library_build || '')}">${esc(t('chat_searched'))}: ${esc(ev.searched.query || '–')}${ev.searched.status === 'none' ? ` — ${esc(t('chat_no_passage'))}` : ev.searched.status === 'unavailable' ? ` — <span data-library-unavailable>${esc(t('chat_library_unavailable'))}</span>` : ''} · ${esc(t('ev_build'))} ${esc(ev.library_build || '–')}${cited ? ` · ${esc(t('ev_checks'))}` : ''}${ev.unknown_tags?.length ? ` <span class="dc-flag" data-unknown-tags>${esc(t('chat_unknown_tag').replace('{list}', ev.unknown_tags.join(', ')))}</span>` : ''}</div>` : '';
  const busy = (btn, on, label) => {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${esc(label || '')}`; }
    else { btn.disabled = false; btn.innerHTML = btn.dataset.label || btn.innerHTML; }
  };

  // ---------------------------------------------------------------- ECAM scenarios
  /** Record how the Stage 1 form set a tracked input: 'manual', 'estimate' (ECAM estimate) or 'typical' (typical value). */
  function inputSid(stage) {return stage===Global.General?'General':stage===Global.Water?'Water':stage===Global.Waste?'Waste':idOf(stage,'s');}
  function markScoped(stage,code,origin='manual') {CW.setInputOrigin(state.inputStatus,idOf(Global),inputSid(stage),code,origin,stage[code]);}
  function changeInputStatus(stage,code,unknown=false) {
    if(!unknown && (typeof stage[code]!=='number'||!Number.isFinite(stage[code]))) return;
    if(unknown) CW.setInputAvailability(state.inputStatus,idOf(Global),inputSid(stage),code,stage[code],'unknown');
    else CW.confirmInputValue(state.inputStatus,idOf(Global),inputSid(stage),code,stage[code]);
    save();render();
  }
  function reviewedResults(sc=Global) {
    const validity=assessmentValidity(sc), ctx={Structure,Info,Tables,Questions,meta:metaOf(sc),inputStatus:state.inputStatus[idOf(sc)],issues:validity.issues};
    const g=GWP_reports[state.gwpIndex || 0], raw=RSData.raw(sc,{Structure,gwp:{report:g.report,ch4:g.ct_ch4_eq,n2o:g.ct_n2o_eq}});
    const graph=RSData.evaluate(sc,ctx), result=RSData.apply(raw,graph);result.validity=validity;result.statusGraph=graph;return result;
  }
  function saveProjectBackup() {if(!persist())return;downloadJson(JSON.stringify(CWProject.pack({...plain(state),assessments:plain(Scenarios),assessmentMeta:Scenarios.map(metaOf)}),null,2),'chatwater-full-workspace-backup.json');}
  function importProjectText(text,companionText) {
    const parsed=CWProject.parse(text,companionText);
    if(!parsed.ok) {toast(parsed.error);return false;}
    if(parsed.kind!=='project') {
      const names=addAssessments(parsed.assessments);
      if(parsed.recovery) state.transferRecovery=[...(state.transferRecovery || []),{at:new Date().toISOString(),warning:parsed.warning,payload:parsed.recovery}];
      state.transferWarning=parsed.warning;save();render();toast(parsed.warning);return names;
    }
    if(!persist()) {toast('Save the current workspace successfully before restoring a project.');return false;}
    const key=newId('workspace');
    const result=CW.writeSession(window.localStorage,'cwr.v1.workspace.'+key,parsed.state);
    if(!result.ok) {toast('Project could not be restored; the current workspace is unchanged.');return false;}
    window.location.assign('?workspace='+encodeURIComponent(key));return true;
  }

  function markEntered(prefix, stage, code, origin = 'manual') {
    if (!Global) return;
    markScoped(stage,code,origin);
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
    const previous = Global, oldMeta = metaOf(previous);
    const copy = Ecam.from(o); Scenarios.push(copy);
    const newMeta = metaOf(copy), oldStatus = state.inputStatus[oldMeta.id];
    if (oldStatus) {
      state.inputStatus[newMeta.id] = CW.duplicateInputStatus(oldStatus,oldMeta,newMeta);
    }
    setCurrent(Scenarios.length - 1);
  }
  function deleteScenario() {
    if (Scenarios.length < 2) return;
    Scenarios.splice(state.current, 1); setCurrent(0);
  }
  /** Add checked ECAM assessments (CW.parseEcamFile), renaming copies whose name is already used. Returns the names as loaded. */
  function addAssessments(list) {
    const built = list.map(o => {
      const draft=RSData.prepare(o,Structure,new Ecam().General);
      return Ecam.from(draft);
    }); // throws before anything is added
    const names = [];
    for (const s of built) {
      s.General.Name = CW.uniqueName(s.General.Name || 'Assessment', Scenarios.map(x => x.General.Name));
      Scenarios.push(s); state.inputStatus[idOf(s)] = {origin:'imported',s:{}}; names.push(s.General.Name);
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
    // the sample comes with a hypothetical profile (responsibilities included) unless the user already has one
    if (!state.profile || !state.profile.name) {
      try { const r = CW.parseProfileJson(await fetch('/samples/utility-a-profile.json').then(x => x.text())); if (r.ok) state.profile = r.profile; } catch { /* the sample still loads */ }
    }
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
    $('#save-status').textContent = r.ok ? `${t('saved')} · ${new Intl.DateTimeFormat(state.lang === 'id' ? 'id-ID' : 'en-US', { timeStyle: 'short' }).format(new Date())}` : t('not_saved');
    renderStorageAlert();
    return r.ok;
  }
  function save() {
    $('#save-status').textContent = t('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
    clearTimeout(readinessTimer);readinessTimer=setTimeout(refreshReadiness,180);
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
      assessments: Scenarios.map(s => ({ id: idOf(s), revision: CW.revision(s), supportRevision:reviewedResults(s).supportRevision })),
      gwpIndex: state.gwpIndex, actionResult: state.actionResult, actionSet: state.actionSet,
      selectedActions: state.selectedActions, plan: state.plan, proposal: state.proposal,
      profile: state.profile, financing: state.financing, rejected: state.rejectedActions,
      customActions: CW.customDefs(state.customActions, state.actionNotes),
    });
  }
  // user-proposed actions
  const customList = () => state.customActions || (state.customActions = []);
  const customFor = aid => customList().filter(c => c.assessmentId === aid);
  const customByKey = key => customList().find(c => c.key === key) || null;
  const customLocation = c => { const sc = byId(c.assessmentId); return CA.resolveLocation(c, sc ? metaOf(sc) : null); };
  const inSavedSelection = key => (state.selectedActions || []).some(a => a.key === key);
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
  // What drafts can draw on: the curated document library and its limits, or that it is not available.
  function evidenceNotice() {
    const lib = META.library;
    if (!lib) return '';
    if (!lib.loaded) return `<div class="notice small warn" data-evidence-notice="missing"><b>${esc(t('evidence_title'))}</b> ${esc(t('evidence_body_missing'))}</div>`;
    return `<div class="notice small" data-evidence-notice="library" data-library-build="${esc(lib.build_id || '')}">${esc(t('evidence_body_library').replace('{n}', lib.sources).replace('{build}', lib.build_id || '–'))}</div>`;
  }
  const genErrorNotice = what => state.ui.genError?.what === what
    ? `<div class="notice error" data-gen-error="${what}"><b>${esc(t('gen_failed_' + what))}</b> ${esc(state.ui.genError.message)}<br>${esc(t('gen_failed_kept'))}
      <button class="link" data-dismiss-error>${esc(t('dismiss'))}</button></div>` : '';
  function previousControl(what) {
    const prev = state.previous?.[what];
    return prev ? `<button class="btn" data-restore="${what}">${esc(t('restore_previous'))} <span class="muted small">(${esc(fmtDate(prev.at, true))})</span></button>` : '';
  }

  async function generatePlan(btn, lang) {
    const sc = byId(state.actionSet?.assessmentId);
    if (!sc || freshness().actions.length) return toast(t('outdated_hint_actions'));
    if(state.ui.reviewGenerating)return;
    if (state.plan && !confirm(t('confirm_replace_plan'))) return;
    state.ui.reviewGenerating=true;render();
    try {
      await CW.regenerate(state, 'plan', () => api('/api/plan', { actions: state.selectedActions, actionSet: state.actionSet, assessment: plain(sc), meta: metaOf(sc), gwpIndex: state.gwpIndex, profile: state.profile, inputStatus: state.inputStatus?.[idOf(sc)] || null, estimates: estimatesList(sc).length, lang, rejectedActions: state.rejectedActions }));
      state.ui.genError = null;
    } catch (err) { state.ui.genError = { what: 'plan', message: err.message }; }
    finally{state.ui.reviewGenerating=false;}
    save(); render();
  }
  async function generateProposal(btn, lang) {
    const now = freshness();
    if (now.actions.length || now.plan.length) return toast(t(now.actions.length ? 'outdated_hint_actions' : 'outdated_hint_plan'));
    if (summed().plan) return toast(t('legacy_sum_title') + ' ' + t('legacy_sum_body'));
    const sc = sourceAssessment() || Global;
    const f = state.financing;
    if(state.ui.reviewGenerating)return;
    if (state.proposal && !confirm(t('confirm_replace_proposal'))) return;
    state.ui.reviewGenerating=true;render();
    try {
      await CW.regenerate(state, 'proposal', () => api('/api/proposal', {
        route: f.route, customFramework: f.customFramework, guideText: f.guideText,
        actions: state.selectedActions, actionSet: state.actionSet, plan: state.plan, profile: state.profile,
        assessment: plain(sc), meta: metaOf(sc), gwpIndex: state.gwpIndex, inputStatus: state.inputStatus?.[idOf(sc)] || null, lang,
        pathways: f.pathways || [], estimates: estimatesList(sc).length, rejectedActions: state.rejectedActions,
      }));
      state.ui.genError = null;
      state.ui.reviewGenerating=false;return go('finance:draft');
    } catch (err) { state.ui.genError = { what: 'proposal', message: err.message }; }
    finally{state.ui.reviewGenerating=false;}
    save(); render();
  }

  // ---------------------------------------------------------------- shell
  function applyShell() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    document.querySelectorAll('[data-t-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.tAria)));
    document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === state.lang));
    document.querySelectorAll('[data-loc]').forEach(b => b.classList.toggle('on', b.dataset.loc === state.location));
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === state.ui.view.split(':')[0]));
    const f = freshness();
    const staleTab = { actions: f.options.length || f.actions.length, plan: f.plan.length, finance: f.proposal.length };
    document.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('stale', !!staleTab[b.dataset.tab]); b.title = staleTab[b.dataset.tab] ? t('tab_outdated') : ''; });
    $('#ai-chip').textContent = t(META.ai ? 'ai_chip_on' : 'ai_chip_off');
    $('#ai-chip').classList.toggle('off', !META.ai);
    const chipText = state.profile?.name ? `${state.profile.name}${state.profile.location ? ' · ' + state.profile.location : ''}` : (sourceAssessment()?.General?.Name || '');
    $('#profile-chip').textContent = chipText;
    $('#profile-chip').hidden = !chipText;
    $('#chat-input').placeholder = t('chat_placeholder');
    $('#chat').classList.toggle('collapsed', !state.ui.chatOpen);
    $('#chat-toggle').textContent = state.ui.chatOpen ? '–' : '+';
    $('#chat-toggle').setAttribute('aria-label', t(state.ui.chatOpen ? 'aria_hide_chat' : 'aria_show_chat'));
  }

  let readinessTimer,latestReadiness;
  const readinessState=()=>({...state,assessments:Scenarios,assessmentMeta:Scenarios.map(metaOf)});
  function readinessReport(){
    const InputCodes=Object.fromEntries(Structure.filter(s=>s.sublevel).map(s=>[s.prefix,Object.keys(new s.class()).filter(c=>typeof new s.class()[c]==='number')]));
    const assessments=Scenarios.map(assessment=>{const result=reviewedResults(assessment);return {assessment,meta:metaOf(assessment),result,validity:result.validity};});
    return Ready.evaluate(readinessState(),{assessments,Info,Tables,Questions,InputCodes});
  }
  const readinessLabel=code=>String(UI[state.lang]?.['gc_rule_'+code]||tE(code+'_descr')||tE(code)||code).replace(/<[^>]+>/g,'');
  function decorateReadiness(report){
    const aid=idOf(Global),sel=state.ui.sel,stage=sel?.kind==='ss'?Global[Structure.find(s=>s.prefix===sel.prefix)?.level]?.[Structure.find(s=>s.prefix===sel.prefix)?.sublevel]?.[sel.index]:sel?.kind==='stage'?Global[sel.level]:Global.General;
    const scope=stage?inputSid(stage):'General';
    document.querySelectorAll('[data-kind="num"], [data-kind="option"], [data-gen]').forEach(el=>{
      const code=el.dataset.code||el.dataset.gen,f=report.fields.find(f=>f.assessmentId===aid&&f.scope===scope&&f.code===code),key=Ready.targetId({kind:'field',assessmentId:aid,scope,code}),id=key+'-description';
      if(!el.id)el.id=key;el.setAttribute('aria-required',String(!!f&&f.active&&f.kind!=='optional'));
      const matches=report.issues.filter(i=>i.target.kind==='field'&&i.assessmentId===aid&&i.target.scope===scope&&i.target.code===code);
      let note=document.getElementById(id);if(!note){note=document.createElement('div');note.id=id;note.className='small readiness-field';el.insertAdjacentElement('afterend',note);}
      const label=t('gc_'+(f?.kind==='required'?'required':f?.kind==='calculation'?'calculation':'optional_field'));
      note.textContent=label+(f?.explicitUnknown?' · '+t('gc_unknown_note'):f?.active===false?' · '+t('gc_inactive_note'):'')+(matches.length?' — '+[...new Set(matches.map(i=>ReadyUI.explanation(i,t,state.lang)))].join(' '):'');
      const described=new Set((el.getAttribute('aria-describedby')||'').split(' ').filter(Boolean));described.add(id);el.setAttribute('aria-describedby',[...described].join(' '));
      el.setAttribute('aria-invalid',String(matches.some(i=>['invalid','date','date_order','number','percent','hours','power_factor','option','nonnegative','relation','inactive_conflict'].includes(i.messageKey))));
      // Replace the older generic blank prompt with the adapter's explicit-unknown explanation.
      document.querySelectorAll('[data-error]').forEach(error=>{if(error.dataset.error===code&&matches.length){error.textContent=[...new Set(matches.map(i=>ReadyUI.explanation(i,t,state.lang)))].join(' ');if(!error.id)error.id=key+'-error';}});
    });
    document.querySelectorAll('[data-sec],[data-pc],#plan-summary,[data-owner],[data-weeks]').forEach(el=>{el.setAttribute('aria-required','true');const id=(el.id||el.dataset.owner||el.dataset.weeks||'section')+'-review-required';let note=el.nextElementSibling;if(!note?.matches('[data-review-required]')){note=document.createElement('span');note.dataset.reviewRequired='';note.className='small readiness-field';el.insertAdjacentElement('afterend',note);}note.textContent=t('gc_review_required');});
    document.querySelectorAll('[data-q]').forEach(el=>{el.setAttribute('aria-label',String(tE(el.dataset.q)||el.dataset.q).replace(/<[^>]+>/g,'')+' — '+t(el.value==='1'?'yes':'no'));if(!el.id)el.id=Ready.targetId({kind:'question',assessmentId:aid,scope,code:el.dataset.q})+'-'+el.value;});
    document.querySelectorAll('[data-validity-issue]').forEach(b=>{const old=b.closest('[role=status]');if(old)old.hidden=true;});
    document.querySelectorAll('#dl-all,#dl-word,[data-reviewed-export],#gen-plan,#draft,#show-options,#save-actions,[data-act=finish]').forEach(b=>b.setAttribute('aria-describedby','readiness-title'));
  }
  function refreshReadiness(){
    clearTimeout(readinessTimer);if(!Global)return;
    const report=latestReadiness=readinessReport(),stage=state.ui.view.split(':')[0],root=$('#view');
    if(state.ui.readyIssueId&&!report.issues.some(i=>i.id===state.ui.readyIssueId)){clearGuidedTarget();state.ui.readyIssueId=null;}
    const html=ReadyUI.panel(report,readinessState(),stage,{t,esc,label:readinessLabel}),old=$('#readiness-panel');
    if(old)old.outerHTML=html;else {const heading=root.querySelector('.page-head');if(heading)heading.insertAdjacentHTML('afterend',html);else root.insertAdjacentHTML('afterbegin',html);}
    root.querySelectorAll('[data-ready-issue]').forEach(b=>b.onclick=()=>navigateReadiness(b.dataset.readyIssue,b.dataset.readyExcerpt));
    document.querySelectorAll('[data-tab]').forEach(b=>{
      const local={...state,ui:{...state.ui,readyOperation:null}},relevant=ReadyUI.relevant(report,local,b.dataset.tab),n=relevant.issues.filter(i=>i.severity==='blocker').length,w=relevant.issues.filter(i=>i.severity==='warning').length;
      b.querySelector('[data-readiness-count]')?.remove();const badge=document.createElement('span');badge.dataset.readinessCount='';badge.className='readiness-count';badge.textContent=` ! ${n} · △ ${w}`;b.append(badge);b.setAttribute('aria-label',t('tab_'+b.dataset.tab)+` — ${t('gc_blocker')}: ${n}; ${t('gc_warning')}: ${w}`);
    });
    const r=ReadyUI.relevant(report,state,stage),counts=['blocker','warning','optional'].map(k=>t('gc_'+k)+': '+r.issues.filter(i=>i.severity===k).length).join('; '),announce=$('#readiness-announcement');
    if(announce&&announce.textContent!==counts)announce.textContent=counts;
    decorateReadiness(report);
  }
  function blockReadiness(operation){
    const report=readinessReport();if(!report.operations[operation]?.blocked)return false;
    state.ui.readyOperation=operation;refreshReadiness();$('#readiness-title')?.focus();return true;
  }
  function navigateReadiness(id,excerpt){
    const report=readinessReport(),issue=report.issues.find(i=>i.id===id);if(!issue)return refreshReadiness();
    const target=issue.target,resolved=Ready.resolve(readinessState(),target);
    const unavailable=key=>{const el=$('#readiness-navigation-error');if(el){el.textContent=t('gc_'+key);el.focus();}};
    if(!resolved.ok)return unavailable(resolved.reason);
    setCurrent(resolved.assessmentIndex);if(resolved.selection)state.ui.sel=resolved.selection;
    if(target.kind==='operation'&&['calculate_actions','select_actions'].includes(target.operation))state.selectedAssessmentId=target.assessmentId;
    state.ui.readyIssueId=id;go(resolved.view);
    let el;
    if(target.kind==='field')el=[...document.querySelectorAll('[data-gen],[data-code]')].find(e=>(e.dataset.gen||e.dataset.code)===target.code&&['INPUT','SELECT','TEXTAREA'].includes(e.tagName)&&!['exception','unit'].includes(e.dataset.kind));
    if(['document','review'].includes(target.kind)){
      const doc=state[target.document];
      if(target.kind==='review')el=[...document.querySelectorAll(target.reviewControl==='confirm'?'[data-review-confirm]':'[data-review-note]')].find(e=>(e.dataset.reviewConfirm||e.dataset.reviewNote)===target.document+'|'+resolved.partId);
      else if(target.sectionKey==='summary'&&target.document==='plan')el=$('#plan-summary');
      else if(target.sectionKey==='schedule')el=$('#review-plan-schedule');
      else if(target.sectionKey){const parts=target.document==='proposal'?doc.sections:doc.concept?.areas,k=target.document==='proposal'?'key':'id',index=parts.findIndex(p=>p[k]===target.sectionKey);el=[...document.querySelectorAll(target.document==='proposal'?'[data-sec]':'[data-pc]')].find(e=>+(e.dataset.sec??e.dataset.pc)===index);}
      else el=$('#review-'+target.document);
    }
    if(target.kind==='task'){const i=state.plan.tasks.findIndex(t=>t.id===target.taskId);el=[...document.querySelectorAll(target.code==='owner'?'[data-owner]':'[data-weeks]')].find(e=>+(e.dataset.owner??e.dataset.weeks)===i);}
    if(target.kind==='action'){const edit=[...document.querySelectorAll('[data-edit-custom]')].find(b=>b.dataset.editCustom===target.actionKey);if(edit){edit.click();el=document.querySelector('#custom-form [name=location]')||document.querySelector('[name=location]');}}
    if(target.kind==='operation')el=({calculate_actions:$('#show-options'),select_actions:document.querySelector('[data-pick]')||$('#show-options'),draft_plan:$('#gen-plan'),draft_proposal:$('#draft')})[target.operation];
    if(target.kind==='assessment')el=document.querySelector('[data-add]')||document.querySelector('[data-gen=Name]');
    if(!el&&target.kind==='field'){
      const owners=Object.entries(Questions).filter(([,q])=>q?.variables?.includes(target.code)).map(([q])=>q);
      el=[...document.querySelectorAll('[data-q]')].find(e=>owners.includes(e.dataset.q)&&!e.disabled);if(el)unavailable('target_inactive');
    }
    const reviewUnavailable=el?.disabled&&target.kind==='review';
    if(reviewUnavailable)el=[...document.querySelectorAll('[data-review-note]')].find(e=>e.dataset.reviewNote===target.document+'|'+resolved.partId);
    if(el?.disabled)return unavailable('operation_unavailable');
    if(!el)return unavailable('target_missing');
    for(let parent=el.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
    highlightTarget(el,ReadyUI.instructions(issue,t,state.lang)+(reviewUnavailable?' '+t('gc_review_blocked'):''),issue.excerpts?.includes(excerpt)?excerpt:issue.excerpts?.[0]);
  }
  function clearGuidedTarget(){
    document.querySelectorAll('.guided-target-highlight').forEach(e=>{e.classList.remove('guided-target-highlight');e.setAttribute('aria-describedby',(e.getAttribute('aria-describedby')||'').split(/\s+/).filter(x=>x&&x!=='readiness-target-explanation').join(' '));});
    document.querySelectorAll('[data-guided-target-row],#readiness-target-explanation').forEach(e=>e.remove());
  }
  function highlightTarget(el,instructions,quote){
    clearGuidedTarget();
    for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
    el.classList.add('guided-target-highlight');
    const description=document.createElement('p');description.className='notice small readiness-target-note';description.id='readiness-target-explanation';description.textContent=t('gc_target_shown')+' — '+instructions;const row=el.closest('tr');if(row){const tr=document.createElement('tr');tr.dataset.guidedTargetRow='true';const td=document.createElement('td');td.colSpan=row.children.length;td.append(description);tr.append(td);row.insertAdjacentElement('afterend',tr);}else (el.closest('label')||el).insertAdjacentElement('afterend',description);
    if(instructions===t('gc_warning_help')){const link=document.createElement('a');link.href='#review-action-caveats';link.textContent=' '+t('gc_shared_warnings');description.append(link);}
    el.setAttribute('aria-describedby',[(el.getAttribute('aria-describedby')||'').replace(/readiness-target-explanation/g,''),description.id].join(' ').trim());
    if(!el.matches('input,select,textarea,button,[tabindex]'))el.tabIndex=-1;
    el.scrollIntoView({block:'center'});el.focus({preventScroll:true});
    if(quote&&el.tagName==='TEXTAREA'){const at=el.value.indexOf(quote);if(at>=0)el.setSelectionRange(at,at+quote.length);else description.textContent+=' '+t('gc_section_only');}

  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const operation=b.dataset.reviewedExport?'export_reviewed':b.id==='dl-word'||b.id==='dl-all'?'export_draft':b.dataset.act==='finish'?'finish_assessment':({ 'show-options':'calculate_actions','save-actions':'save_actions','gen-plan':'draft_plan','draft':'draft_proposal'})[b.id];
    if(operation&&blockReadiness(operation)){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  function go(view) { state.ui.readyOperation=null;state.ui.view = view; save(); render(); window.scrollTo({ top: 0 }); }

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
    renderChat();refreshReadiness();
  }

  // ---------------------------------------------------------------- stage 1: choose module (ECAM is the entry point)
  function viewChoose(root) {
    root.innerHTML = `
      <div class="page-head"><h1>${esc(t('choose_module'))}</h1><p class="muted">${esc(t('choose_module_sub'))}</p></div>
      <div class="card" data-entry="ecam"><h2>${esc(t('ecam_available'))}</h2><p>${esc(t('ecam_desc'))}</p>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" data-go="assess:entry">${esc(t('start_or_load_ecam'))}</button>
        <a class="btn" href="https://climatesmartwater.org/ecam/" target="_blank" rel="noopener">climatesmartwater.org/ecam ↗</a></div>
        <p class="small muted" style="margin:10px 0 0">${esc(t('entry_hint'))}</p></div>
      <div class="card muted-card"><h2>${esc(t('later_modules'))}</h2>
        <p><b>CREAT</b> · ${esc(t('creat_desc'))}</p>
        <p style="margin:0"><b>WHO</b> · ${esc(t('who_desc'))}</p></div>`;
  }

  // Fields of the optional-details form. Other saved profile fields (population, contact, notes, …) are kept as they are.
  const DETAIL_FIELDS = [['name', 'p_name'], ['location', 'p_location']];
  /** Responsibility and capacity questions (responsibility.js). Unanswered areas are pre-filled from a saved service type only. */
  function responsibilityFields(p) {
    const suggested = RS.answered(p) ? {} : RS.suggestedRoles(p.service_type);
    const prefilled = Object.keys(suggested).length > 0;
    const sel = (name, values, value, labelOf) => `<select name="${name}"><option value="">${esc(t(name.startsWith('resp_') ? 'role_unset' : 'opt_unset'))}</option>${values.map(v =>
      `<option value="${v}" ${value === v ? 'selected' : ''}>${esc(labelOf(v))}</option>`).join('')}</select>`;
    const areas = Object.entries(RS.AREAS).map(([area, key]) => `<label class="field"><span>${esc(t('area_' + area))}</span>
      ${sel(key, RS.ROLES, p[key] || suggested[key] || '', v => t('role_' + v))}</label>`).join('');
    const caps = Object.entries(RS.CAPACITY).map(([key, values]) => `<label class="field"><span>${esc(t(key))}</span>
      ${sel(key, values, p[key] || '', v => t(key + '_' + v))}</label>`).join('');
    return `<fieldset class="resp-fields" data-responsibility><legend>${esc(t('resp_title'))}</legend>
        <p class="small muted" style="margin:0 0 8px">${esc(t('resp_sub'))}</p>
        ${prefilled ? `<p class="small dc-flag" data-prefilled>${esc(t('resp_prefilled'))}</p>` : ''}
        <div class="grid2">${areas}</div></fieldset>
      <fieldset class="resp-fields"><legend>${esc(t('cap_title'))}</legend><div class="grid2">${caps}</div></fieldset>`;
  }
  /**
   * Optional details next to the assessment: what the responsibility split, pathways and the proposal title use.
   * Blank answers stay blank ("not specified"); nothing is derived from the ECAM numbers.
   */
  function openDetails() {
    const p = state.profile || {};
    const m = $('#modal');
    m.innerHTML = `<form class="box" id="details-form" aria-labelledby="details-title"><h2 id="details-title">${esc(t('details_title'))}</h2><p class="muted">${esc(t('details_sub'))}</p>
      <div class="grid2">${DETAIL_FIELDS.map(([k, lab]) => `<label class="field"><span>${esc(t(lab))}</span><input type="text" name="${k}" value="${esc(p[k] ?? '')}" placeholder="${esc(t('not_specified'))}"></label>`).join('')}</div>
      ${responsibilityFields(p)}
      <div class="actions-row"><button type="button" class="btn" id="details-cancel">${esc(t('cancel'))}</button><button class="btn primary">${esc(t('details_apply'))}</button></div></form>`;
    m.hidden = false;
    $('#details-cancel').onclick = () => (m.hidden = true);
    $('#details-form').onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const answers = Object.fromEntries([...DETAIL_FIELDS.map(([k]) => k), ...RS.PROFILE_KEYS].map(k => [k, String(fd.get(k) ?? '').trim()]));
      if (state.profile || Object.values(answers).some(Boolean)) state.profile = { ...(state.profile || {}), ...answers };
      m.hidden = true; save(); toast(t('details_saved')); render();
    };
  }

  function assessmentValidity(sc = Global) {
    const InputCodes = Object.fromEntries(Structure.filter(s => s.sublevel).map(s => {const defaults = new s.class(); return [s.prefix,Object.keys(defaults).filter(c => typeof defaults[c] === 'number')];}));
    return AV.validate(sc, {Info, Questions, Tables, InputCodes, meta:metaOf(sc), inputStatus:state.inputStatus[idOf(sc)]});
  }
  function finishAssessment() {
    if (!assessmentValidity().valid || !reviewedResults().completeness.complete) {go('assess:results');return;}
    state.finished[idOf(Global)] = new Date().toISOString();
    state.selectedAssessmentId = idOf(Global);
    save(); toast(t('finished'));
    go('actions:select');
  }

  // ---------------------------------------------------------------- stage 2: actions
  function summaryOf(sc) {
    if (!assessmentValidity(sc).valid || !reviewedResults(sc).completeness.complete) return "Incomplete assessment — review unknown or unconfirmed inputs";
    const result=reviewedResults(sc), g=result.totals;
    const rows = CWForm.stageTotals(sc).sort((a, b) => b.total - a.total);
    const top = rows[0];
    return `${fmt(g.total / 1000)} tCO₂eq · ${fmt(result.energy_kwh)} kWh` + (top && top.total ? ` · ${t('top_source')}: ${stageLabel(top.prefix)} (${fmt(100 * top.total / g.total, 0)}%)` : '');
  }

  // user actions whose assessment was deleted are kept and listed; they are never attached to another assessment
  const orphanActions = () => customList().filter(c => !byId(c.assessmentId));
  const orphanNotice = orphans => orphans.length ? `<div class="notice warn" data-custom-orphans="${orphans.length}"><b>${esc(t('ca_orphans_title'))}</b>
    <ul>${orphans.map(c => `<li>${esc(c.id)} · ${esc(c.title)}</li>`).join('')}</ul>${esc(t('ca_orphans_body'))}
    <div class="row" style="margin-top:6px"><button class="btn sm danger" id="delete-orphans">${esc(t('ca_delete_orphans'))}</button></div></div>` : '';
  function bindOrphans(root, orphans) {
    const btn = root.querySelector('#delete-orphans');
    if (!btn) return;
    btn.onclick = () => {
      if (!confirm(t('ca_confirm_delete_orphans').replace('{n}', orphans.length))) return;
      const gone = new Set(orphans.map(c => c.key));
      state.customActions = customList().filter(c => !gone.has(c.key));
      state.selectedKeys = state.selectedKeys.filter(k => !gone.has(k));
      gone.forEach(k => delete state.actionNotes[k]);
      save(); render();
    };
  }

  function viewActionsSelect(root) {
    const orphans = orphanActions();
    if (!Scenarios.some(s => assessmentValidity(s).valid)) {
      root.innerHTML = `<div class="page-head"><h1>${esc(t('identify_title'))}</h1></div><div class="notice warn">${esc(t('no_assessments'))}</div>
        ${orphanNotice(orphans)}<button class="btn primary" data-go="assess:entry">${esc(t('tab_assess'))}</button>`;
      bindOrphans(root, orphans);
      return;
    }
    if (!byId(state.selectedAssessmentId)) state.selectedAssessmentId = idOf(Global);
    const savedFrom = byId(state.actionSet?.assessmentId);
    root.innerHTML = `<div class="page-head"><h1>${esc(t('identify_title'))}</h1><p class="muted">${esc(t('identify_sub'))}</p></div>
      ${state.actionResult?.legacy ? `<div class="notice warn">${esc(t('legacy_options'))}</div>` : ''}
      ${orphanNotice(orphans)}
      ${savedFrom && idOf(savedFrom) !== state.selectedAssessmentId ? `<div class="notice small">${esc(t('actions_saved_for'))}: <b>${esc(savedFrom.General.Name)}</b></div>` : ''}
      <div class="card result-list">${Scenarios.map(s => `<label><input type="radio" name="asel" value="${esc(idOf(s))}" ${idOf(s) === state.selectedAssessmentId ? 'checked' : ''}>
        <div><b>${esc(s.General.Name)}</b> <span class="muted small">${esc(fmtDate(s.General.AssessmentPeriodStart))} – ${esc(fmtDate(s.General.AssessmentPeriodEnd))}${state.finished[idOf(s)] ? ' · ✓' : ''}</span><br>
        <span class="small">${esc(summaryOf(s))}</span></div></label>`).join('')}</div>
      <div class="actions-row"><button class="btn primary" id="show-options">${esc(t('show_options'))}</button></div>`;
    root.querySelectorAll('[name=asel]').forEach(r => r.onchange = () => { state.selectedAssessmentId = r.value; save(); });
    bindOrphans(root, orphans);
    root.querySelector('#show-options').onclick = async e => {
      busy(e.target, true, t('show_options'));
      try {
        const sc = byId(state.selectedAssessmentId) || Global;
        const meta = metaOf(sc), aid = meta.id;
        const res = await api('/api/actions', { assessment: plain(sc), meta, gwpIndex: state.gwpIndex, lang: state.lang });
        state.actionLabels[aid] = CW.assignLabels(res.options, state.actionLabels[aid]);
        // user-proposed actions are not produced by the rules: re-running keeps them, their selection and notes
        const offered = new Set([...res.options.map(o => o.key), ...customFor(aid).map(c => c.key)]);
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
        state.actionResult = { assessmentId: aid, assessmentName: sc.General.Name, basis: res.basis, options: res.options, assumptions: res.assumptions, checks: res.checks || [], availability_checks:res.availability_checks || [] };
        go('actions:compare');
      } catch (err) { toast(t('error') + ': ' + err.message); busy(e.target, false); }
    };
  }

  const expectedCell = o => DC.benefit(o, { t, L, esc, fmt });

  // Cards whose details the user opened in this page session (not saved)
  const openCards = new Set();
  function cardCtx(aid) {
    return {
      t, L, esc, fmt, stageLabel, lang: state.lang,
      labelOf: code => rich(tE(code + '_descr') || tE(code) || code),
      unitView: code => CW.unitView(Units, Info, byId(aid) || Global, code),
      status: (sid, code, value) => inputStatusOf(aid, sid, code, value),
      substageName: sid => substageById(byId(aid), sid)?.name || null,
    };
  }
  const safeKg = fn => { try { const v = fn(); return Number.isFinite(v) ? v : null; } catch { return null; } };
  /** ECAM's first-level source outputs per substage (AS.COMPONENTS), with each substage's own total. */
  function emissionRows(sc) {return AS.rowsFromResults(reviewedResults(sc),metaOf(sc));}
  /** Largest assessed contributor of one assessment, from ECAM's first-level source outputs (AS.COMPONENTS). */
  function contributorOf(sc) {
    if (!sc) return null;
    const { rows, subTotals } = emissionRows(sc);
    return AS.largestContributor(rows, subTotals, reviewedResults(sc).totals.total);
  }

  // ---------------------------------------------------------------- meeting feedback (Oct 20)
  const fuCtx = () => ({ t, L, esc, fmt, stageLabel, lang: state.lang,
    componentText: (p, c) => { const src = AS.sourceOfOutput(p, c); return src ? t('src_' + src) : String(tE(`${p}_KPI_GHG_${c}_descr`) || c).replace(/<[^>]+>/g, ''); } });
  /** Stage 1 results and Stage 2: total inventory vs what the utility can act on (or the contributor panel when the profile is not answered). */
  function responsibilityHtml(sc, ctx) {
    if (!sc) return '';
    if (!reviewedResults(sc).completeness.complete) return '<div class="notice warn">Inventory is incomplete; contribution ranks and responsibility totals are unavailable.</div>';
    if (!RS.answered(state.profile)) return FU.responsibilityPanel([], state.profile, fuCtx()) + DC.contributor(contributorOf(sc), ctx);
    return FU.responsibilityPanel(emissionRows(sc).rows, state.profile, fuCtx());
  }
  // Inputs set from ECAM estimates: state.estimateUse[assessmentId][substageId][code] = value when set.
  // A record only counts while the value is unchanged, so typing a measured value replaces it.
  function recordEstimate(stage, code) {
    if (!Global) return;
    const m = state.estimateUse || (state.estimateUse = {});
    const a = m[idOf(Global)] || (m[idOf(Global)] = {});
    (a[idOf(stage, 's')] || (a[idOf(stage, 's')] = {}))[code] = stage[code];
  }
  const isEstimate = (sc, stage, code) => { const r = state.estimateUse?.[idOf(sc)]?.[idOf(stage, 's')]; return !!r && code in r && r[code] === stage[code] && stage[code] !== 0; };
  function estimatesList(sc) {
    const out = [];
    if (!sc) return out;
    for (const [p, lv, sl] of CW.STAGE_KEYS) for (const ss of sc[lv][sl]) {
      const r = state.estimateUse?.[idOf(sc)]?.[idOf(ss, 's')] || {};
      for (const code of Object.keys(r)) {
        if (!isEstimate(sc, ss, code)) continue;
        const u = CW.unitView(Units, Info, sc, code);
        out.push({ prefix: p, substage: ss.name, code, label: rich(tE(code + '_descr') || code), value: fmt(ss[code] / (u.mult || 1)), unit: u.unit });
      }
    }
    return out;
  }
  /** Fill zero inputs of one substage with ECAM's own estimates; only inputs shown by the current answers. */
  function fillEstimates(prefix, stage) {
    if (typeof Estimations === 'undefined') return 0;
    let n = 0;
    for (let pass = 0; pass < 2; pass++) for (const code of Object.keys(stage)) {
      if (typeof stage[code] !== 'number' || stage[code] !== 0 || typeof Estimations[code] !== 'function') continue;
      if (Questions.is_hidden(code, stage)) continue;
      let v; try { v = Estimations[code](stage); } catch { continue; }
      if (!Number.isFinite(v) || v === 0) continue;
      stage[code] = v; markEntered(prefix, stage, code, 'estimate'); recordEstimate(stage, code); n++;
    }
    return n;
  }
  // Alternatives and revisions shown under a Stage 2 card (kept for this page session only)
  const altResults = new Map();
  /** Location of a Stage 2 option, for a user action drafted from it. */
  function optionLocation(o) {
    if (CW.isCustom(o)) return o.location || { at: 'assessment' };
    const sid = DC.optionSid(o);
    return o.substage && sid && sid !== 'utility' ? { at: 'substage', prefix: o.substage.prefix, sid } : { at: 'assessment' };
  }
  function addAlternative(aid, o, res, item) {
    const N = CA.LIMITS, cut = (v, n) => String(v || '').slice(0, n);
    const fromFramework = res.source !== 'ai' && item.problem ? `${t('alt_from_framework').split('.')[0]}: ${item.problem}.` : '';
    const description = cut([item.description, item.why && `${t('alt_why')}: ${item.why}`, item.open && `${t('alt_open')}: ${item.open}`, fromFramework].filter(Boolean).join('\n\n') || item.title, N.description);
    const label = CA.nextLabel([...customFor(aid).map(c => c.id), state.customLastLabel?.[aid]].filter(Boolean));
    const saved = CA.create({ assessmentId: aid, cid: newId('c'), label, now: new Date().toISOString(),
      input: { title: cut(item.title, N.title), description, problem: cut(item.problem, N.problem), location: optionLocation(o) } });
    if (!saved) return toast(t('error'));
    state.customLastLabel = { ...(state.customLastLabel || {}), [aid]: label };
    state.customActions = [...customList(), saved];
    state.actionNotes[saved.key] = `${t('alt_based_on').replace('{id}', o.id)} · ${t(res.source === 'ai' ? 'alt_from_ai' : 'alt_from_framework')}`;
    toast(t('alt_added').replace('{id}', label));
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
    state.ui.readyIssueId=null;
    go(sel ? 'assess:entry' : 'assess:results');
    const source=d.sources?.[0]?.source;
    const code=source==='grid_electricity'&&sel?sel.prefix+'_nrg_cons':null;
    const field=code?[...document.querySelectorAll('[data-code]')].find(e=>e.dataset.code===code&&e.matches('input,select,textarea')):null;
    const section=field||document.querySelector(sel?'#ss-outputs':'[data-detail-tables]')||document.querySelector('main h2');
    if(section)highlightTarget(section,field?t('gc_source_field').replace('{field}',readinessLabel(code)):t('gc_source_scope'));

  }

  /** Add (existing = null) or edit a user-proposed action of assessment aid. User text is stored as written. */
  function openCustomForm(aid, existing) {
    const sc = byId(aid);
    if (!sc) return toast(t('stale_assessment_missing'));
    const loc = existing ? customLocation(existing) : { at: 'assessment' };
    const v = existing || { title: '', description: '', problem: '' };
    const note = existing ? state.actionNotes[existing.key] || '' : '';
    const N = CA.LIMITS;
    const hint = (req, n) => `<span class="field-hint">(${esc(t(req ? 'ca_required' : 'ca_optional'))}, ${esc(t('ca_max').replace('{n}', n))})</span>`;
    const field = (name, req, n, control) => `<label class="field" style="grid-column:1/-1"><span>${esc(t('ca_' + name))} ${hint(req, n)}</span>${control}
      <span class="field-error" id="ca-err-${name}" role="alert" hidden></span></label>`;
    const subOpts = CW.STAGE_KEYS.map(([p, lv, sl]) => sc[lv][sl].length ? `<optgroup label="${esc(stageLabel(p))}">${sc[lv][sl].map(ss => {
      const sid = idOf(ss, 's');
      return `<option value="${esc(p + '|' + sid)}" ${loc.at === 'substage' && loc.sid === sid ? 'selected' : ''}>${esc(stageLabel(p))} › ${esc(ss.name)}</option>`;
    }).join('')}</optgroup>` : '').join('');
    const m = $('#modal');
    m.innerHTML = `<form class="box" id="custom-form" novalidate><h2>${esc(t(existing ? 'ca_form_edit' : 'ca_form_title'))}</h2>
      <p class="muted small">${esc(t('ca_form_sub'))}</p>
      <div class="grid2">
        ${field('title', true, N.title, `<input type="text" name="title" maxlength="${N.title}" required aria-required="true" aria-describedby="ca-err-title" value="${esc(v.title)}">`)}
        ${field('description', true, N.description, `<textarea class="field" name="description" rows="4" maxlength="${N.description}" required aria-required="true" aria-describedby="ca-err-description">${esc(v.description)}</textarea>`)}
        ${field('problem', false, N.problem, `<input type="text" name="problem" maxlength="${N.problem}" aria-describedby="ca-err-problem" value="${esc(v.problem)}">`)}
        <label class="field" style="grid-column:1/-1"><span>${esc(t('ca_location'))}</span>
          <select name="location" aria-describedby="ca-err-location">
            ${loc.at === 'missing' ? `<option value="__missing" selected>${esc(t('ca_location_gone'))}</option>` : ''}
            <option value="assessment" ${loc.at === 'assessment' ? 'selected' : ''}>${esc(t('loc_assessment'))} (${esc(sc.General.Name)})</option>${subOpts}
          </select><span class="field-error" id="ca-err-location" role="alert" hidden></span></label>
        ${field('notes', false, N.notes, `<textarea class="field" name="notes" rows="2" maxlength="${N.notes}" aria-describedby="ca-err-notes">${esc(note)}</textarea>`)}
      </div>
      <div class="actions-row"><button type="button" class="btn" id="custom-cancel">${esc(t('cancel'))}</button><button class="btn primary">${esc(t('ca_save'))}</button></div></form>`;
    m.hidden = false;
    const form = $('#custom-form');
    form.elements.title.focus();
    $('#custom-cancel').onclick = () => (m.hidden = true);
    form.onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(form);
      const sel = String(fd.get('location') || 'assessment');
      const [prefix, sid] = sel.includes('|') ? sel.split('|') : [];
      const input = {
        title: fd.get('title'), description: fd.get('description'), problem: fd.get('problem'),
        location: sid ? { at: 'substage', prefix, sid } : { at: 'assessment' },
      };
      const notes = String(fd.get('notes') || '').trim();
      const errs = CA.fieldErrors({ ...input, notes });
      if (sel === '__missing') errs.location = 'missing';
      for (const name of ['title', 'description', 'problem', 'notes', 'location']) {
        const el = $('#ca-err-' + name), code = errs[name];
        el.hidden = !code;
        el.textContent = !code ? '' : code === 'missing' ? t('ca_location_review') : t('ca_err_' + code).replace('{n}', N[name]);
        if (form.elements[name]) form.elements[name].setAttribute('aria-invalid', code ? 'true' : 'false');
      }
      const first = ['title', 'description', 'problem', 'location', 'notes'].find(n => errs[n]);
      if (first) return form.elements[first].focus();
      const now = new Date().toISOString();
      let saved, msg;
      if (existing) {
        saved = CA.update(existing, input, now);
        state.customActions = customList().map(c => c.key === existing.key ? saved : c);
        const changed = CW.fp(CW.customContent({ ...existing, notes: state.actionNotes[existing.key] || '' })) !== CW.fp(CW.customContent({ ...saved, notes }));
        msg = changed && inSavedSelection(saved.key) ? 'ca_updated_saved' : 'ca_updated';
      } else {
        const label = CA.nextLabel([...customFor(aid).map(c => c.id), state.customLastLabel?.[aid]].filter(Boolean));
        saved = CA.create({ assessmentId: aid, cid: newId('c'), label, input, now });
        if (!saved) return toast(t('error'));
        state.customLastLabel = { ...(state.customLastLabel || {}), [aid]: label };
        state.customActions = [...customList(), saved];
        msg = 'ca_saved';
      }
      if (notes) state.actionNotes[saved.key] = notes; else delete state.actionNotes[saved.key];
      m.hidden = true;
      toast(persist() ? t(msg) : t('not_saved_kept_in_page'));
      render();
    };
  }
  /** Delete after a confirmation that says what else is affected; downstream text is never removed. */
  function deleteCustom(key) {
    const c = customByKey(key);
    if (!c) return;
    const msg = [t('ca_confirm_delete').replace('{title}', c.title),
      state.selectedKeys.includes(key) ? t('ca_confirm_delete_selected') : null,
      inSavedSelection(key) ? t('ca_confirm_delete_saved') : null].filter(Boolean).join('\n\n');
    if (!confirm(msg)) return;
    state.customActions = customList().filter(x => x.key !== key);
    state.selectedKeys = state.selectedKeys.filter(k => k !== key);
    delete state.actionNotes[key];
    toast(persist() ? t('ca_deleted') : t('not_saved_kept_in_page'));
    render();
  }

  // shares stored as fractions (0.1) are shown as percentages; unknown keys keep their code
  const ASSUMPTION_SHARE = ['solar_share', 'biogas_capture'];
  const assumptionText = (k, v) => {
    const label = t('asm_' + k);
    const value = ASSUMPTION_SHARE.includes(k) ? fmt(100 * v, 0) + ' %' : fmt(v, 2);
    return `${label === 'asm_' + k ? k : label}: ${value}`;
  };
  function viewActionsCompare(root) {
    const r = state.actionResult;
    if (!r || r.legacy) return go('actions:select');
    const f = freshness();
    const optionsStale = f.options.length > 0;
    const showDetails = !!state.ui.showDetails;
    const ctx = { ...cardCtx(r.assessmentId), chat: true };
    const explainHtml = o => o.rule === 'baseline' ? '' : `<div class="row" style="margin-top:6px"><button class="btn sm" data-explain="${esc(o.key)}" ${META.ai ? '' : `disabled title="${esc(t('ai_off_short'))}"`}>${esc(t('explain_ai'))}</button>${META.ai ? '' : ` <span class="small muted">${esc(t('ai_off_short'))}</span>`}</div>
      ${state.explanations[o.key] ? `<div class="ai-text">${esc(state.explanations[o.key])}${sourcesHtml(state.explanationSources?.[o.key])}${evidenceHtml(state.explanationEvidence?.[o.key], true)}</div>` : ''}`;
    const sort = AS.MEASURES[state.ui.actionSort] ? state.ui.actionSort : 'original';
    // user-proposed actions follow the calculated options; sorting puts them with the other unquantified ones
    const all = [...r.options, ...customFor(r.assessmentId)];
    const fu = fuCtx();
    const rejected = state.rejectedActions || (state.rejectedActions = {});
    const toolsHtml = o => o.rule === 'baseline' ? '' : `<div class="row dc-tools" style="gap:6px;margin-top:6px">
        <button class="btn sm" data-alt="${esc(o.key)}">${esc(t('act_alternatives'))}</button>
        <button class="btn sm" data-revise="${esc(o.key)}" ${META.ai ? '' : `disabled title="${esc(t('act_revise_off'))}"`}>${esc(t('act_revise'))}</button>
        <button class="btn sm" data-reject="${esc(o.key)}">${esc(t('act_reject'))}</button></div>
      ${FU.alternatives(altResults.get(o.key), o.key, fu)}`;
    const cardHtml = o => {
      const common = { selected: state.selectedKeys.includes(o.key), note: state.actionNotes[o.key] || '', open: showDetails || openCards.has(o.key), measure: sort === 'original' ? null : sort,
        compact: true, extraHtml: FU.cardLine(o, state.profile, fu), toolsHtml: toolsHtml(o) };
      return CW.isCustom(o) ? DC.customCard(o, ctx, { ...common, location: customLocation(o) })
        : DC.card(o, ctx, { ...common, checks: r.checks, explainHtml: explainHtml(o) });
    };
    const rejectedRow = o => `<div class="card dcard rejected" data-card="${esc(o.key)}" data-rejected><div class="row"><span class="grow"><b>${esc(o.id)}</b> · ${esc(L(o.title))}
        ${rejected[o.key]?.reason ? `<div class="small muted">${esc(t('rejected_reason'))}: ${esc(rejected[o.key].reason)}</div>` : ''}
        ${inSavedSelection(o.key) ? `<div class="small dc-flag-inline" data-rejected-saved>${esc(t('rejected_in_saved'))}</div>` : ''}</span>
        <button class="btn sm" data-restore-action="${esc(o.key)}">${esc(t('act_restore'))}</button></div></div>`;
    const groups = {};
    for (const o of AS.sortOptions(all, sort)) { const g = o.rule === 'baseline' ? 'baseline' : RS.groupOf(o, state.profile, rejected); (groups[g] = groups[g] || []).push(o); }
    const groupHtml = g => {
      const list = groups[g];
      if (!list || !list.length) return '';
      const head = `${g === 'rejected' ? `<span class="tier tier-rejected">× ${esc(t('tier_rejected'))}</span>` : FU.tierChip(g, fu)} <span class="small muted">(${list.length}) · ${esc(t('tier_desc_' + g))}</span>`;
      const body = g === 'rejected' ? list.map(rejectedRow).join('') : list.map(cardHtml).join('');
      return g === 'outside' || g === 'rejected' ? `<details class="grp" data-group="${g}"><summary class="grp-h">${head}</summary>${body}</details>`
        : `<section class="grp" data-group="${g}"><h3 class="grp-h">${head}</h3>${body}</section>`;
    };
    const cards = (groups.baseline || []).map(cardHtml).join('') + RS.GROUP_ORDER.map(groupHtml).join('');
    const review = state.actionReview || [];
    const source = byId(r.assessmentId);
    // the source assessment's current figures; while options are outdated they may no longer match the cards
    const contrib = source && !optionsStale ? responsibilityHtml(source, ctx) : '';
    const days = source ? source.Days() : null;
    root.innerHTML = `<div class="page-head"><h1>${esc(t('compare_title'))}</h1><p class="muted">${esc(t('compare_sub'))} · <b>${esc(source?.General.Name || r.assessmentName)}</b></p>
        <div class="chat-entry"><button type="button" class="btn sm" data-chat="missing">${esc(t('chat_btn_missing'))}</button></div></div>
      ${staleNotice(f.options, 'options')}
      ${review.length ? `<div class="notice warn"><b>${esc(t('review_selection'))}</b><ul>${review.map(x => `<li>${esc(L(x))}</li>`).join('')}</ul></div>` : ''}
      ${contrib}
      ${r.checks ? DC.panel(r.checks, r.options, ctx, { open: openCards.has('__checks') }) : ''}
      <div class="row" style="margin-bottom:10px"><span class="grow small muted">${esc(t('groups_hint'))}</span>
        <label class="small row" style="gap:6px">${esc(t('sort_label'))}
          <select id="action-sort" style="width:auto">${['original', 'ghg', 'kwh'].map(k => `<option value="${k}" ${k === sort ? 'selected' : ''}>${esc(t('sort_' + k))}</option>`).join('')}</select></label>
        <button class="btn sm" id="toggle-details">${esc(showDetails ? t('hide_details') : t('details'))}</button></div>
      ${sort === 'original' ? '' : `<p class="small muted" data-sort-note="${sort}">${esc(t('sort_note').replace('{days}', fmt(days, 0)))}</p>`}
      ${(r.availability_checks || []).some(c=>!RSData.ok(c.status)) ? `<div class="notice warn" data-unavailable-actions><b>Some action estimates are unavailable</b><ul>${(r.availability_checks || []).filter(c=>!RSData.ok(c.status)).map(c=>`<li>${esc(c.name || 'Utility')} · ${esc(c.rule)}: ${esc(c.status)} — ${esc((c.missing || []).join(', '))}</li>`).join('')}</ul>Unknown inputs are not zero; these estimates are not ranked as quantified benefits.</div>` : ''}
      <div class="dcards">${cards}</div>
      <div class="row" style="margin:4px 0 10px"><button class="btn" id="add-custom">+ ${esc(t('add_custom'))}</button></div>
      <details class="small" style="margin-top:12px"><summary>${esc(t('assumptions_title'))}</summary>${!r.assumptions?`<p class="notice warn">${esc(t('gc_assumptions_missing'))}</p>`:''}<ul class="notice small" data-assumptions>${Object.entries(r.assumptions||{}).map(([k, v]) => `<li>${esc(assumptionText(k, v))}</li>`).join('')}</ul></details>
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
      if (rejected[k]) { cb.checked = false; return; }
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
        const res = await api('/api/actions/explain', { option: { ...o, notes: state.actionNotes[o.key] }, assessment: plain(sc), meta: metaOf(sc), gwpIndex: state.gwpIndex,
          profile: state.profile, inputStatus: state.inputStatus?.[r.assessmentId] || null, lang: state.lang });
        state.explanations[o.key] = res.text;
        state.explanationSources = { ...(state.explanationSources || {}), [o.key]: res.sources || [] };
        state.explanationEvidence = { ...(state.explanationEvidence || {}), [o.key]: res.evidence || null };
        save(); render();
      } catch (err) { busy(b, false); toast(err.status === 503 ? t('ai_off_note') : t('error') + ': ' + err.message); }
    });
    root.querySelector('#add-custom').onclick = () => openCustomForm(r.assessmentId, null);
    root.querySelectorAll('[data-act=edit-profile]').forEach(b => b.onclick = openDetails);
    const optionByKey = k => r.options.find(x => x.key === k) || customByKey(k);
    // Not relevant: the action leaves the selection; its notes, the saved selection and generated text are kept.
    // A saved selection that still contains it is outdated (freshness: action_rejected) until saved again.
    root.querySelectorAll('[data-reject]').forEach(b => b.onclick = () => {
      const key = b.dataset.reject, o = optionByKey(key), id = o ? o.id : '';
      const saved = inSavedSelection(key), picked = state.selectedKeys.includes(key);
      if ((saved || picked) && !confirm(t(saved ? 'reject_confirm_saved' : 'reject_confirm_picked').replaceAll('{id}', id))) return;
      const reason = prompt(t('reject_prompt'), '');
      if (reason === null) return;
      rejected[key] = { reason: reason.trim().slice(0, 500), at: new Date().toISOString(), ...(picked ? { picked: true } : {}) };
      state.selectedKeys = state.selectedKeys.filter(k => k !== key);
      save(); render();
    });
    root.querySelectorAll('[data-restore-action]').forEach(b => b.onclick = () => {
      const key = b.dataset.restoreAction, was = rejected[key] || {};
      delete rejected[key];
      if (was.picked || inSavedSelection(key)) state.selectedKeys = [...new Set([...state.selectedKeys, key])];
      save(); render();
    });
    const askAlternatives = async (b, mode) => {
      const o = optionByKey(b.dataset.alt || b.dataset.revise);
      const sc = byId(r.assessmentId);
      if (!o || !sc) return toast(t('stale_assessment_missing'));
      let request = '';
      if (mode === 'revise') { request = prompt(t('revise_prompt'), ''); if (!request || !request.trim()) return; }
      busy(b, true, t('thinking'));
      try {
        const res = await api('/api/actions/alternatives', { option: { ...o, notes: state.actionNotes[o.key] || '' }, assessment: plain(sc), meta: metaOf(sc), gwpIndex: state.gwpIndex,
          profile: state.profile, mode, request, lang: state.lang });
        altResults.set(o.key, res); render();
      } catch (err) { busy(b, false); toast(err.status === 503 ? t('ai_off_note') : t('error') + ': ' + err.message); }
    };
    root.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => askAlternatives(b, 'alternatives'));
    root.querySelectorAll('[data-revise]').forEach(b => b.onclick = () => askAlternatives(b, 'revise'));
    root.querySelectorAll('[data-alt-close]').forEach(b => b.onclick = () => { altResults.delete(b.dataset.altClose); render(); });
    root.querySelectorAll('[data-alt-add]').forEach(b => b.onclick = () => {
      const [k, i] = [b.dataset.altAdd.slice(0, b.dataset.altAdd.lastIndexOf('|')), +b.dataset.altAdd.split('|').pop()];
      const o = optionByKey(k), res = altResults.get(k), item = res && res.items[i];
      if (!o || !item) return;
      addAlternative(r.assessmentId, o, res, item);
      persist(); render();
    });
    root.querySelectorAll('[data-edit-custom]').forEach(b => b.onclick = () => openCustomForm(r.assessmentId, customByKey(b.dataset.editCustom)));
    root.querySelectorAll('[data-delete-custom]').forEach(b => b.onclick = () => deleteCustom(b.dataset.deleteCustom));
    root.querySelector('#save-actions').onclick = () => {
      if (freshness().options.length) return toast(t('outdated_hint_options'));
      const custom = customFor(r.assessmentId).filter(c => state.selectedKeys.includes(c.key));
      if (custom.some(c => customLocation(c).at === 'missing')) return toast(t('ca_location_blocked'));
      const chosen = [...r.options.filter(o => o.rule !== 'baseline' && state.selectedKeys.includes(o.key)), ...custom]
        .map(o => ({ ...o, notes: state.actionNotes[o.key] || '' }));
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

  function reviewContext() {
    const ids=new Set([state.plan?.deps?.assessmentId,state.proposal?.deps?.assessmentId,state.actionSet?.assessmentId]);
    return {freshness:freshness(),pending:!!state.ui.reviewGenerating,results:Scenarios.filter(a=>ids.has(idOf(a))).map(a=>({...reviewedResults(a),assessmentId:idOf(a)}))};
  }
  function documentReview() {return DR.evaluate(state,reviewContext());}
  function reviewPanel(kind) {
    const report=documentReview(),d=report.documents[kind];if(!d)return '';
    const tr=k=>DR.t(k,state.lang),issues=kind==='proposal'?report.issues:d.issues.map(i=>({...i,document:kind}));
    return `<section class="card" id="review-${kind}" tabindex="-1" aria-label="${esc(tr('review'))}"><h2>${esc(tr('status'))}: <span data-document-status="${kind}">${esc(tr(d.status))}</span></h2><p class="small">${esc(tr('meaning'))}</p>
      <div id="review-action-caveats" tabindex="-1"><h3>${esc(t('gc_shared_warnings'))}</h3>${state.selectedActions.filter(a=>a.provisional_warning||CW.isCustom(a)).map(a=>`<p class="notice warn small"><b>${esc(L(a.title)||a.id)}</b>: ${esc(a.provisional_warning?L(a.provisional_warning):t('gc_unquantified'))}</p>`).join('')}</div><h3>${esc(tr('unresolved'))}</h3><div role="status" aria-live="polite">${issues.length?`<p>${issues.length} · <a href="#readiness-panel">${esc(t('gc_title'))}</a></p>`:`<p>${esc(tr('none'))}</p>`}</div>
      ${d.sections.map(r=>`<fieldset><legend>${esc(r.title)} — ${esc(tr(r.status))}</legend>${r.warnings.length?`<ul class="small">${r.warnings.map(w=>`<li>${w==='calculation'?`<a href="#review-action-caveats">${esc(t('gc_shared_warnings'))}</a>`:esc(tr(w))}</li>`).join('')}</ul>`:''}
        <label class="field"><span>${esc(t(r.warnings.length?'gc_required':'gc_optional_field'))} · ${esc(tr('note'))}</span><textarea data-review-note="${kind}|${r.id}" aria-required="${r.warnings.length>0}" aria-label="${esc(r.title+' — '+tr('note'))}">${esc(state[kind]?.reviewNotes?.[r.id]??r.note)}</textarea></label>
        <label><input type="checkbox" data-review-confirm="${kind}|${r.id}" data-review-association="${esc(r.association)}" ${r.status==='reviewed'?'checked':''} ${!r.canReview||state.ui.reviewGenerating?'disabled':''}> ${esc(tr('confirm').replace('{section}',r.title))}</label>
        <p class="small muted">${esc(tr('association'))}: ${esc(r.association)}</p><p data-review-error="${r.id}" role="alert"></p></fieldset>`).join('')}</section>`;
  }
  function refreshDocumentReview(root,kind) {
    const panel=root.querySelector('#review-'+kind);if(panel)panel.outerHTML=reviewPanel(kind);
    bindDocumentReview(root,kind);
    const report=documentReview();root.querySelectorAll('[data-reviewed-export]').forEach(b=>b.disabled=!!exportBlockedReason()||report.status!=='reviewed'||!!state.ui.reviewGenerating);
  }
  function bindDocumentReview(root,kind) {
    root.querySelectorAll('[data-review-note]').forEach(tx=>tx.oninput=()=>{
      const [what,id]=tx.dataset.reviewNote.split('|'),doc=state[what];doc.reviewNotes={...doc.reviewNotes,[id]:tx.value};DR.clear(doc,id);save();
      const panel=root.querySelector('#review-'+what),report=documentReview();
      panel.querySelector('[data-document-status]').textContent=DR.t(report.documents[what].status,state.lang);
      panel.querySelector('[role=status]').textContent=DR.t('unreviewed',state.lang);
      const cb=panel.querySelector(`[data-review-confirm="${what}|${id}"]`);cb.checked=false;
      root.querySelectorAll('[data-reviewed-export]').forEach(b=>b.disabled=true);
    });
    root.querySelectorAll('[data-review-confirm]').forEach(cb=>cb.onchange=()=>{
      const [what,id]=cb.dataset.reviewConfirm.split('|'),note=root.querySelector(`[data-review-note="${what}|${id}"]`).value;
      try{DR.confirm(state,what,id,cb.dataset.reviewAssociation,{note,checked:cb.checked},reviewContext());save();refreshDocumentReview(root,kind);}
      catch(e){cb.checked=false;const error=root.querySelector(`[data-review-error="${id}"]`);error.textContent=DR.t(e.message,state.lang);error.tabIndex=-1;error.focus();}
    });
  }
  function refreshConceptReview(root, p) { refreshDocumentReview(root,'plan'); }
  function conceptHtml(p) {
    const cp = p && p.concept;
    if (!cp || !cp.areas) return '';
    const checks = a => {
      const c = a.status === 'ai' ? a.checks || {} : {};
      return [c.unsupported_figures ? t('pc_check_figures').replace('{list}', c.unsupported_figures.join(', ')) : '',
        c.unknown_tags ? t('pc_check_tags').replace('{list}', c.unknown_tags.join(', ')) : '',
        c.placeholders_dropped ? t('pc_check_placeholders') : '',
        a.status === 'ai' && CW.mayBeIncomplete(a.text) ? t('may_be_incomplete') : '']
        .filter(Boolean).map(s => `<div class="small dc-flag" data-pc-check>${esc(s)}</div>`).join('');
    };
    return `<div class="card" data-concept><h2>${esc(t('pc_title'))}</h2><p class="small muted">${esc(t('pc_sub'))}</p>
      ${cp.ai_failed ? `<div class="notice warn small" data-pc-ai-failed>${esc(t('pc_ai_failed'))}</div>` : ''}

      ${cp.areas.map((a, i) => `<div class="pc-area" data-area="${a.n}"><div class="row"><h3 class="grow" style="margin:0">${a.n}. ${esc(a.title)}
          <span class="pc-st pc-${esc(a.status)}" data-pc-status="${i}">${esc(t('pc_status_' + a.status))}</span></h3>
          </div>
        <div class="small muted">${esc(a.description || '')}</div>${checks(a)}
        ${a.questions && a.questions.length ? `<details class="small"><summary>${esc(t('pc_questions'))}</summary><ul>${a.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul></details>` : ''}
        <textarea id="review-plan-concept-${i}" aria-label="${esc(a.title)}" data-pc="${i}" rows="${Math.min(12, Math.max(4, String(a.text || '').split('\n').length + 1))}">${esc(a.text)}</textarea></div>`).join('')}
      ${cp.ai ? sourcesHtml(cp.sources) : ''}</div>`;
  }
  function viewPlan(root) {
    if (!state.selectedActions.length) {
      root.innerHTML = `<div class="page-head"><h1>${esc(t('plan_title'))}</h1></div><div class="notice warn">${esc(t('no_actions'))}</div><button class="btn primary" data-go="actions:select">${esc(t('tab_actions'))}</button>`;
      return;
    }
    const p = state.plan;
    const fr = freshness();
    const acts = state.selectedActions.map(a => `<li data-plan-action="${esc(a.key || a.id)}"><b>${esc(a.id)}</b> ${esc(L(a.title))}${CW.isCustom(a)
      ? ` <span class="badge-user">${esc(t('user_proposed'))}</span> <span class="badge-unreviewed">${esc(t('not_reviewed'))}</span>` : ''} — <span class="muted">${expectedCell(a)}</span></li>`).join('');
    let body = '';
    if (p) {
      const max = p.total_weeks || 1;
      body = `<div class="card"><div class="row"><h2 class="grow">${esc(t('project_summary'))}</h2><button type="button" class="btn sm" data-chat="plan">${esc(t('chat_btn_plan'))}</button></div>
          ${p.ai === false ? `<div class="notice small">${esc(t('ai_off_note'))}</div>` : ''}
          ${p.ai === true && CW.mayBeIncomplete(p.summary) ? `<div class="small dc-flag" data-incomplete="plan">${esc(t('may_be_incomplete'))}</div>` : ''}
          <div class="section-edit"><textarea id="plan-summary" aria-label="${esc(t('project_summary'))}">${esc(p.summary || '')}</textarea></div>${p.ai === false ? relatedHtml(p.related || p.sources) : sourcesHtml(p.sources)}${evidenceHtml(p.evidence, p.ai !== false)}</div>
        ${conceptHtml(p)}
        <div class="card" id="review-plan-schedule" tabindex="-1" style="overflow:auto"><div class="row"><h2 class="grow">${esc(t('tasks'))}</h2><span class="muted">${esc(t('total_duration'))}: <b>${p.total_weeks}</b> ${esc(t('weeks_unit'))}</span></div>
          <table class="data"><thead><tr><th>ID</th><th>${esc(t('task'))}</th><th>${esc(t('owner'))}</th><th class="num">${esc(t('start_week'))}</th><th class="num">${esc(t('weeks'))}</th><th>${esc(t('depends'))}</th></tr></thead><tbody>
          ${p.tasks.map((k, i) => `<tr><td>${esc(k.id)}</td><td><span class="muted small">${esc(k.action_id)} · ${esc(k.action)}${k.action_origin === 'user' ? ` · ${esc(t('user_proposed'))}` : ''}</span><br>${esc(k.name)}
              ${state.ui.planDetails ? `<div class="gantt"><div class="gbar" style="margin-left:${100 * k.start_week / max}%;width:${Math.max(1, 100 * k.weeks / max)}%"></div></div>` : ''}</td>
            <td><input type="text" data-owner="${i}" aria-label="${esc(k.name+' — '+t('owner'))}" value="${esc(k.owner)}"></td><td class="num">${k.start_week}</td>
            <td><input type="number" min="0" step="1" data-weeks="${i}" aria-label="${esc(k.name+' — '+t('weeks'))}" value="${k.weeks}" style="width:70px"></td><td>${esc((k.depends_on || []).join(', '))}</td></tr>`).join('')}
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
      ${p ? reviewPanel('plan') : ''}
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
      p.deps = CW.planDeps({ assessmentId: idOf(sc), assessment: sc, gwpIndex: state.gwpIndex, actions: state.selectedActions, profile: state.profile, supportRevision:reviewedResults(sc).supportRevision });
      save(); render();
    };
    root.querySelector('#plan-summary').oninput = e => { p.summary = e.target.value; DR.clear(p,'summary'); save(); refreshSummed(root, 'plan'); refreshConceptReview(root, p); };
    root.querySelectorAll('[data-pc]').forEach(tx => tx.oninput = () => {
      const a = p.concept.areas[+tx.dataset.pc];
      a.text = tx.value; DR.clear(p,'concept-'+tx.dataset.pc);delete a.reviewed; if (a.status !== 'edited') { a.status = 'edited'; const st = root.querySelector(`[data-pc-status="${tx.dataset.pc}"]`); if (st) { st.className = 'pc-st pc-edited'; st.textContent = t('pc_status_edited'); } }
      save(); refreshConceptReview(root, p);
    });
    bindDocumentReview(root,'plan');
    root.querySelectorAll('[data-owner]').forEach(i => i.oninput = () => { p.tasks[+i.dataset.owner].owner = i.value; DR.clear(p,'schedule');save();refreshDocumentReview(root,'plan'); });
    root.querySelectorAll('[data-weeks]').forEach(i => i.onchange = () => { p.tasks[+i.dataset.weeks].weeks = Math.max(0, parseInt(i.value, 10) || 0); recomputeSchedule(p);DR.clear(p,'schedule');save();render(); });
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
      <div id="pathways">${pathwayCache.html || ''}</div>
      ${card('general', t('general_proposal'), t('general_desc'), `<button class="btn ${f.route === 'general' ? 'primary' : ''}">${esc(t('use_general'))}</button>`)}
      ${card('custom', t('tailor'), t('tailor_desc'), `<label class="btn ${f.route === 'custom' ? 'primary' : ''}">${esc(t('add_guide'))}<input type="file" id="guide-file" accept=".pdf,.docx,.txt,.md" hidden></label>
        ${f.guideName ? `<span class="small muted" style="margin-left:8px">${esc(t('guide_loaded'))}: ${esc(f.guideName)}</span>` : ''}
        ${f.customFramework?.requirements?.length ? `<div class="notice small" style="margin-top:10px"><b>${esc(t('requirements'))}</b><ul>${f.customFramework.requirements.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${f.customFramework?._note ? `<p class="small muted" style="margin-top:8px">${esc(f.customFramework._note)}</p>` : ''}`)}
      ${card('gcf', t('gcf'), t('gcf_desc'), `<button class="btn ${f.route === 'gcf' ? 'primary' : ''}">${esc(t('use_gcf'))}</button><p class="small muted" style="margin:8px 0 0">${esc(t('gcf_note'))}</p>`)}
      <div class="actions-row"><button class="btn" data-go="plan">${esc(t('back'))}</button>
        ${state.proposal ? `<button class="btn" data-go="finance:draft">${esc(t('open_draft'))}</button>` : ''}
        ${previousControl('proposal')}
        ${exportScopeNotice()}<button class="btn" id="dl-all" ${exportBlocked ? 'disabled' : ''}>${esc(DR.t('draft_download',state.lang))} · ${esc(DR.t('package',state.lang))}</button>
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
    loadPathways(root);
  }
  // Financing pathways for the selected actions (server match; cached for the same actions, profile and language)
  const pathwayCache = { key: null, match: null, html: '' };
  function bindPathways(root) {
    const f = state.financing;
    root.querySelectorAll('[data-fp]').forEach(cb => cb.onchange = () => {
      const set = new Set(f.pathways || []);
      cb.checked ? set.add(cb.dataset.fp) : set.delete(cb.dataset.fp);
      f.pathways = [...set];
      save(); render();
    });
  }
  async function loadPathways(root) {
    const el = root.querySelector('#pathways');
    if (!el || !state.selectedActions.length) return;
    const key = CW.fp({ a: state.selectedActions.map(a => a.key || a.id), p: state.profile, l: state.lang });
    const paint = () => { pathwayCache.html = FU.pathways(pathwayCache.match, new Set(state.financing.pathways || []), fuCtx()); el.innerHTML = pathwayCache.html; bindPathways(root); };
    if (pathwayCache.key === key && pathwayCache.match) return paint();
    try {
      pathwayCache.match = await api('/api/pathways', { actions: state.selectedActions, profile: state.profile, lang: state.lang });
      pathwayCache.key = key; paint();
    } catch (err) { el.innerHTML = ''; }
  }

  function exportScopeNotice() {const ids=[state.proposal?.deps?.assessmentId,state.plan?.deps?.assessmentId,state.actionSet?.assessmentId].filter(Boolean),sc=new Set(ids).size===1?byId(ids[0]):null;return `<p class="notice" data-selected-project-scope>${esc(t('selected_package_scope').replace('{name}',sc?.General.Name || '—'))}</p>`;}
  function exportState(exportMode='working_draft') {
    return { ...plain(state), exportMode, assessments: plain(Scenarios), assessmentMeta: Scenarios.map(metaOf), projectTransfer:CWProject.pack({...plain(state),assessments:plain(Scenarios),assessmentMeta:Scenarios.map(metaOf)}), chat: undefined, chatThreads: undefined, checkpoints: undefined, legacy: undefined, previous: undefined };
  }
  // mirrors the server check so the user sees why before a request is made
  function exportBlockedReason() {
    const f = freshness();
    for (const [k, what] of [['actions', 'actions'], ['plan', 'plan'], ['proposal', 'proposal']]) if (f[k].length) return t('outdated_hint_' + what);
    const s = summed();
    if (s.plan || s.proposal.length) return t('legacy_sum_title') + ' ' + t('legacy_sum_body');
    return '';
  }
  async function downloadAll(btn,exportMode='working_draft') {
    const why = exportBlockedReason();
    if (why) return toast(why);
    busy(btn, true, t('download_all'));
    try {
      const blob = await api('/api/export', exportState(exportMode), true);
      download(blob, `${(state.profile?.name || sourceAssessment()?.General?.Name || 'chatwater').replace(/[^\w-]+/g, '_')}-chatwater-files.zip`);
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
      ${reviewPanel('proposal')}
      ${p.sections.map((s, i) => `<div class="card section-edit"><div class="row"><h2 class="grow">${esc(s.title)}${s.ai === false || (s.ai === undefined && p.ai === false) ? ` <span class="badge-template">${esc(t('template_badge'))}</span>` : ''}</h2><button type="button" class="btn sm" data-chat="proposal_section" data-index="${i}">${esc(t('chat_btn_section'))}</button></div><div class="guidance">${esc(s.guidance || '')}</div>${s.quotes_plan_summary === 'ai' ? `<div class="small dc-flag">${esc(t('sec_quotes_ai_summary'))}</div>` : ''}${(s.ai === true && CW.mayBeIncomplete(s.text)) || (s.quotes_plan_summary === 'ai' && CW.mayBeIncomplete(s.text, { anyParagraph: true })) ? `<div class="small dc-flag" data-incomplete="${i}">${esc(t('may_be_incomplete'))}</div>` : ''}<textarea id="review-proposal-section-${i}" aria-label="${esc(s.title)}" data-sec="${i}">${esc(s.text)}</textarea>${s.ai === false || (s.ai === undefined && p.ai === false) ? relatedHtml(s.related || s.sources) : sourcesHtml(s.sources)}${evidenceHtml(s.evidence, s.ai === true)}</div>`).join('')}
      <div class="actions-row"><button class="btn" data-go="finance">${esc(t('back'))}</button>
        ${previousControl('proposal')}
        ${exportScopeNotice()}<button class="btn" id="dl-word" ${blocked ? 'disabled' : ''}>${esc(DR.t('draft_download',state.lang))} · Word</button>
        <button class="btn primary" id="dl-all" ${blocked ? 'disabled' : ''}>${esc(DR.t('draft_download',state.lang))} · ${esc(DR.t('package',state.lang))}</button><button class="btn" data-reviewed-export="word" ${blocked||state.ui.reviewGenerating||documentReview().status!=='reviewed'?'disabled':''}>${esc(DR.t('reviewed_download',state.lang))} · Word</button><button class="btn" data-reviewed-export="package" ${blocked||state.ui.reviewGenerating||documentReview().status!=='reviewed'?'disabled':''}>${esc(DR.t('reviewed_download',state.lang))} · ${esc(DR.t('package',state.lang))}</button></div>`;
    const refreshDraftReview=()=>refreshDocumentReview(root,'proposal');
    bindDocumentReview(root,'proposal');
    root.querySelectorAll('[data-sec]').forEach(tx => tx.oninput = () => {
      p.sections[+tx.dataset.sec].text = tx.value;DR.clear(p,'section-'+tx.dataset.sec);delete p.sections[+tx.dataset.sec].reviewed;save(); refreshDraftReview();
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
      p.deps = CW.proposalDeps({ assessmentId: idOf(sc), assessment: sc, gwpIndex: state.gwpIndex, actions: state.selectedActions, plan: state.plan, profile: state.profile, supportRevision:reviewedResults(sc).supportRevision, financing: state.financing });
      save(); render();
    };
    const downloadWord=async (btn,exportMode='working_draft') => {
      const why = exportBlockedReason();
      if (why) return toast(why);
      busy(btn, true, t('download_word'));
      try { download(await api('/api/export/docx', exportState(exportMode), true), 'proposal.docx'); }
      catch (err) { toast(t('error') + ': ' + err.message); }
      busy(btn, false);
    };
    root.querySelector('#dl-word').onclick=e=>downloadWord(e.target);
    root.querySelectorAll('[data-reviewed-export]').forEach(b=>b.onclick=()=>b.dataset.reviewedExport==='word'?downloadWord(b,'reviewed'):downloadAll(b,'reviewed'));
    root.querySelector('#dl-all').onclick = e => downloadAll(e.target);
  }

  // ---------------------------------------------------------------- chat
  // The chat is read-only and always about one assessment: the one the current view shows.
  // Each assessment has its own thread, so another assessment's discussion is never sent as context.
  function chatAssessment() {
    const v = state.ui.view || '';
    if (v.startsWith('assess')) return Global;
    if (v === 'actions:compare') return byId(state.actionResult?.assessmentId) || Global;
    if (v === 'actions:select') return byId(state.selectedAssessmentId) || Global;
    return sourceAssessment() || Global;
  }
  const chatThread = aid => (state.chatThreads || (state.chatThreads = {}))[aid] || [];
  const chatFocusFor = aid => (state.ui.chatFocus && state.ui.chatFocus.aid === aid ? state.ui.chatFocus : null);
  const chatViewCtx = () => ({ t, esc, fmt, fmtDate, stageLabel, inputLabel: code => tE(code + '_descr') || code, lang: state.lang });
  // only the latest answers keep their full context and excerpts in storage
  function compactThread(list) {
    let full = 0;
    return list.slice(-30).reverse().map(m => {
      if (m.role !== 'assistant' || m.error || ++full <= 3) return m;
      const { context, ...rest } = m;
      return { ...rest, context: context ? { assessment: context.assessment, focus: context.focus, mentions_other: context.mentions_other } : null,
        retrieval: m.retrieval ? { ...m.retrieval, passages: m.ai === false ? m.retrieval.passages.slice(0, 2) : [] } : null };
    }).reverse();
  }
  function renderChat() {
    const sc = chatAssessment();
    const aid = sc ? idOf(sc) : null;
    const focus = chatFocusFor(aid);
    const vctx = chatViewCtx();
    $('#chat-scope').innerHTML = CV.scope({ name: sc?.General?.Name, focusLabel: focus?.label, ai: META.ai }, vctx);
    const legacy = state.chat?.length ? `<details class="small" data-chat-legacy><summary>${esc(t('chat_legacy'))}</summary>
      ${state.chat.map(m => `<div class="msg ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.content)}</div>`).join('')}</details>` : '';
    const log = $('#chat-log');
    log.innerHTML = `<div class="msg bot">${esc(t('chat_intro'))}</div>` + legacy +
      chatThread(aid).map(m => m.role === 'user' ? `<div class="msg user">${esc(m.content)}</div>` : CV.assistant(m, vctx)).join('');
    log.scrollTop = log.scrollHeight;
  }
  /** focus: { kind, label, … } from an entry point (kept until cleared or the assessment changes). */
  async function askChat(text, focus) {
    if (!text.trim()) return;
    const sc = chatAssessment();
    if (!sc) return;
    const meta = metaOf(sc), aid = meta.id;
    if (focus && typeof focus === 'object') state.ui.chatFocus = { ...focus, aid };
    const f = chatFocusFor(aid);
    state.ui.chatOpen = true; applyShell();
    const thread = chatThread(aid).slice();
    thread.push({ role: 'user', content: text, assessmentId: aid });
    state.chatThreads[aid] = thread;
    renderChat();
    const log = $('#chat-log');
    const pending = document.createElement('div'); pending.className = 'msg bot'; pending.innerHTML = `<span class="spin"></span> ${esc(t('thinking'))}`;
    log.appendChild(pending); log.scrollTop = log.scrollHeight;
    const own = state.actionSet?.assessmentId === aid;
    const custom = customFor(aid);
    const { aid: _aid, label: _label, ...focusBody } = f || { kind: 'general' };
    if (f && focus && typeof focus === 'object') focusBody.entry = true;
    try {
      const res = await api('/api/chat', {
        messages: thread.filter(m => !m.local && !m.error).map(({ role, content, assessmentId }) => ({ role, content, assessmentId })),
        lang: state.lang, view: state.ui.view, focus: focusBody,
        assessment: plain(sc), meta, gwpIndex: state.gwpIndex,
        inputStatus: state.inputStatus?.[aid] || null, actionLabels: state.actionLabels?.[aid] || null,
        actionSet: own ? state.actionSet : null, selectedActions: own ? state.selectedActions : [],
        customActions: custom, actionNotes: Object.fromEntries(custom.map(c => [c.key, state.actionNotes[c.key] || ''])),
        plan: state.plan?.deps?.assessmentId === aid ? state.plan : null,
        proposal: state.proposal?.deps?.assessmentId === aid ? state.proposal : null,
        profile: state.profile, financing: state.financing,
        rejectedActions: Object.fromEntries(Object.entries(state.rejectedActions || {}).filter(([k]) => k.startsWith(aid + '|'))),
        estimateUse: state.estimateUse?.[aid] || null,
        otherAssessments: Scenarios.filter(s => s !== sc).map(s => ({ id: idOf(s), name: s.General.Name })),
      });
      thread.push({ role: 'assistant', assessmentId: aid, ai: res.ai, content: res.reply || '', local: res.ai === false,
        retrieval: res.retrieval, context: res.context, scope: res.scope, sources: res.sources || [], support: res.support || [], unknown_tags: res.unknown_tags || [] });
    } catch (err) {
      thread.push({ role: 'assistant', assessmentId: aid, content: `${t('error')}: ${err.message}`, local: true, error: true });
    }
    state.chatThreads[aid] = compactThread(thread);
    save(); renderChat();
  }
  /** Entry points ([data-chat] buttons): set the focus and ask the matching question. */
  function chatEntry(el) {
    const kind = el.dataset.chat;
    const sc = chatAssessment();
    if (!sc) return;
    const name = sc.General.Name;
    if (kind === 'result') {
      const ss = el.dataset.sid ? CW.STAGE_KEYS.flatMap(([p, lv, sl]) => sc[lv][sl].map(x => ({ p, x }))).find(o => idOf(o.x, 's') === el.dataset.sid) : null;
      if (ss) return askChat(t('chat_q_result').replace('{label}', `${stageLabel(ss.p)} › ${ss.x.name}`), { kind: 'result', sid: el.dataset.sid, label: `${stageLabel(ss.p)} › ${ss.x.name}`, intent: 'explain' });
      return askChat(t('chat_q_results'), { kind: 'result', label: name, intent: 'explain' });
    }
    if (kind === 'missing') return askChat(t('chat_q_missing_all'), { kind: 'missing', label: name, intent: 'missing' });
    if (kind === 'action') {
      const key = el.dataset.key;
      const o = customByKey(key) || state.actionResult?.options.find(x => x.key === key);
      const label = o ? `${o.id} ${L(o.title)}` : key;
      const q = el.dataset.intent === 'missing' ? t('chat_q_missing').replace('{label}', label) : t('chat_q_develop').replace('{label}', label);
      return askChat(q, { kind: 'action', key, label, intent: el.dataset.intent === 'missing' ? 'missing' : 'develop' });
    }
    if (kind === 'plan') return askChat(t('chat_q_plan'), { kind: 'plan', label: t('plan_title'), intent: 'explain' });
    if (kind === 'proposal_section') {
      const s = state.proposal?.sections?.[+el.dataset.index];
      if (s) return askChat(t('chat_q_section').replace('{label}', s.title), { kind: 'proposal_section', index: +el.dataset.index, label: s.title, intent: 'explain' });
    }
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
    const entry = e.target.closest('[data-chat]');
    if (entry) { e.preventDefault(); return chatEntry(entry); }
    if (e.target.closest('[data-chat-unfocus]')) { state.ui.chatFocus = null; save(); return renderChat(); }
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
  window.addEventListener('pagehide', () => persist());
  $('#btn-checkpoint').onclick = checkpoint;
  $('#chat-clear').onclick = () => {
    const sc = chatAssessment(), aid = sc ? idOf(sc) : null;
    if (!(chatThread(aid).length || state.chat.length) || !confirm(t('confirm_clear_chat'))) return;
    if (aid) delete state.chatThreads[aid];
    state.chat = []; state.ui.chatFocus = null; save(); renderChat(); toast(t('chat_cleared'));
  };
  $('#chat-toggle').onclick = () => { state.ui.chatOpen = !state.ui.chatOpen; save(); applyShell(); };
  $('#chat-form').onsubmit = e => { e.preventDefault(); const v = $('#chat-input').value; $('#chat-input').value = ''; askChat(v); };
  $('#chat-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chat-form').requestSubmit(); } });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') e.target.hidden = true; });

  // ---------------------------------------------------------------- boot
  window.App = {
    get state() { return state; }, fmtDate, tEOriginal, fillEstimates, recordEstimate, isEstimate, estimatesList, responsibilityHtml, openDetails, fuCtx, t, tE, rich, esc, fmt, L, save, toast, download, askChat, stageLabel,
    idOf, cardCtx, contributorOf, relatedActions, metaOf,
    refreshReadiness, navigateReadiness, inputSid, markScoped, changeInputStatus, reviewedResults, saveProjectBackup, importProjectText, assessmentValidity, setCurrent, setGwp, newScenario, duplicateScenario, deleteScenario, loadSample, importEcamText, render, finishAssessment, markEntered,
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
      try { const sc = Ecam.from(RSData.prepare(o,Structure,new Ecam().General)); attachMeta(sc, state.assessmentMeta?.[i]); Scenarios.push(sc); }
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
