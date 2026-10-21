/*
 * ECAM data entry and results, driven by ECAM's own metadata:
 *   Info (units, option tables), Questions (yes/no blocks), Exceptions (typical
 *   values), Estimations (suggested values), Units (display conversion) and
 *   each substage class's `equations` list for outputs.
 * Values are stored exactly as ECAM stores them (base units), so files saved
 * here load in the official ECAM tool and vice versa.
 *
 * Depends on globals from app.js: App (state, t, tE, esc, fmt, save, toast, askChat).
 */
const CWForm = (() => {
  const A = () => window.App;
  const STAGES = () => Structure.filter(s => s.sublevel);

  // --- value helpers ------------------------------------------------------
  // value shown = stored base value / mult, labelled with the same unit the multiplier came from
  const mult = code => CW.unitView(Units, Info, Global, code).mult;
  function unitOf(code, base = false) {
    const i = Info[code];
    if (!i) return '';
    if (i.magnitude === 'Currency') return Global.General.Currency;
    if (i.magnitude === 'Option') return '';
    return base ? (i.unit || '') : CW.unitView(Units, Info, Global, code).unit;
  }
  function labelOf(code) {
    return A().tE(code + '_descr') || A().tE(code) || code;
  }
  function safeNum(fn) { try { const v = fn(); return Number.isFinite(v) ? v : null; } catch { return null; } }
  function outputTotal(v) { return v && typeof v === 'object' ? v.total : v; }

  function selected() {
    const st = A().state.ui.sel || { kind: 'general' };
    if (st.kind === 'ss') {
      const s = Structure.find(x => x.prefix === st.prefix);
      const list = s && Global[s.level][s.sublevel];
      if (!list || !list[st.index]) return { kind: 'general' };
      return { ...st, struct: s, obj: list[st.index] };
    }
    if (st.kind === 'stage') return { ...st, obj: Global[st.level] };
    return { kind: 'general' };
  }

  // --- input rows ---------------------------------------------------------
  function inputRow(code, stage, nested) {
    const { t, esc, fmt } = A();
    const info = Info[code] || {};
    const id = 'in_' + code;
    let control = '', extra = '';
    if (info.magnitude === 'Option' && info.table && Tables[info.table]) {
      control = `<select id="${id}" data-code="${code}" data-kind="option">` +
        Tables[info.table].map((row, i) => `<option value="${i}" ${stage[code] == i ? 'selected' : ''}>${esc(A().tE(row.name) || row.name)}</option>`).join('') +
        '</select>';
    } else {
      const shown = stage[code] / mult(code);
      control = `<input type="number" step="any" id="${id}" data-code="${code}" data-kind="num" value="${Number.isFinite(shown) ? +shown.toPrecision(12) : 0}">`;
      const ex = Exceptions[code];
      if (ex && Tables[ex.table]) {
        extra += `<select class="small" data-code="${code}" data-kind="exception" aria-label="${esc(t('select_option'))}">
          <option value="">${esc(t('select_option'))}</option>` +
          Tables[ex.table].map((row, i) => {
            const field = ex.table_field(stage);
            let v = row[field];
            if (typeof v !== 'number') return '';
            if (ex.percent_of) v = v * ex.percent_of(stage);
            else if (ex.conversion) v = v * ex.conversion(stage);
            return `<option value="${v}">${esc(A().tE(row.name) || row.name)} (${fmt(v / mult(code))})</option>`;
          }).join('') + '</select>';
      }
      // values taken from ECAM's estimates stay labelled until the user types their own value
      if (A().isEstimate(Global, stage, code)) {
        extra += `<span class="est-badge" data-est-used="${code}">${esc(t('est_badge'))}</span>`;
      }
      if (typeof Estimations !== 'undefined' && Estimations[code]) {
        const est = safeNum(() => Estimations[code](stage));
        if (est !== null && est !== stage[code]) {
          extra += `<button type="button" class="est" data-code="${code}" data-est="${est}">${esc(t('estimate'))}: ${fmt(est / mult(code))} ${esc(unitOf(code))} — ${esc(t('use_value'))}</button>`;
        }
      }
    }
    const expla = A().tE(code + '_expla');
    return `<tr class="${nested ? 'nested' : ''}">
      <td class="lab"><label for="${id}">${A().rich(labelOf(code))}</label>
        ${expla ? `<button type="button" class="link qhelp" data-help="${code}">${esc(t('more_info'))}</button>` : ''}
        <div class="expla" id="help_${code}" hidden>${A().rich(expla)}<br><button type="button" class="link" data-ask="${code}">${esc(t('ask_chat'))}</button></div>
      </td>
      <td class="val">${control}${extra}</td>
      <td class="unit">${A().rich(unitOf(code))}</td>
    </tr>`;
  }

  function questionBlock(q, ss) {
    const { t, esc } = A();
    const hiddenQ = Questions.is_question_hidden(q, ss);
    const on = !!ss.Configuration.Questions[q];
    let html = `<tr class="q ${hiddenQ ? 'hidden' : ''}"><td class="lab" colspan="2">${A().rich(A().tE(q) || q)}</td>
      <td class="unit"><label><input type="radio" name="q_${q}" data-q="${q}" value="0" ${!on ? 'checked' : ''} ${hiddenQ ? 'disabled' : ''}> ${esc(t('no'))}</label>
      <label><input type="radio" name="q_${q}" data-q="${q}" value="1" ${on ? 'checked' : ''} ${hiddenQ ? 'disabled' : ''}> ${esc(t('yes'))}</label></td></tr>`;
    if (on && !hiddenQ) {
      for (const code of Questions[q].variables) if (typeof ss[code] === 'number') html += inputRow(code, ss, true);
    }
    return html;
  }

  function setQuestion(ss, q, value) {
    ss.Configuration.Questions[q] = value;
    if (!value) {
      Questions[q].otherQuestions.forEach(k => setQuestion(ss, k, false));
      Questions.reset_values(q, ss);
    }
  }

  // --- outputs ------------------------------------------------------------
  function outputsTable(struct, ss) {
    const { t, esc, fmt } = A();
    const rows = (struct.class.equations || []).map(eq => {
      const v = safeNum(() => outputTotal(ss[eq]()));
      if (v === null || v === 0) return '';
      const isGHG = /_KPI_GHG/.test(eq);
      const unit = isGHG ? 'kgCO₂eq' : unitOf(eq, true);
      return `<tr${isGHG && eq === struct.prefix + '_KPI_GHG' ? ' style="font-weight:700"' : ''}><td>${A().rich(labelOf(eq))}</td><td class="num">${fmt(v)}</td><td class="unit small muted">${A().rich(unit)}</td></tr>`;
    }).join('');
    return rows ? `<table class="outputs"><tbody>${rows}</tbody></table>` : `<p class="muted small">–</p>`;
  }

  // --- KPI strip ----------------------------------------------------------
  function kpis() {
    const { t, fmt } = A();
    const g = Global.TotalGHG(), e = Global.TotalNRG();
    const pop = Global.Water.ws_serv_pop() || Global.Waste.ww_serv_pop() || 0;
    const years = Global.Years() || 1;
    return `<div class="kpi"><div class="v">${fmt(g.total / 1000)}</div><div class="l">${t('total_ghg')} (tCO₂eq)</div></div>
      <div class="kpi"><div class="v">${fmt(e)}</div><div class="l">${t('total_energy')} (kWh)</div></div>
      <div class="kpi"><div class="v">${pop ? fmt(g.total / pop / years) : '–'}</div><div class="l">kgCO₂eq ${t('per_capita')}</div></div>`;
  }

  // --- general panel -------------------------------------------------------
  function generalPanel() {
    const { t, esc, state } = A();
    const g = Global.General;
    const countries = Object.keys(Countries);
    const gwp = GWP_reports.map((r, i) => `<option value="${i}" ${state.gwpIndex == i ? 'selected' : ''}>${esc(r.report)}</option>`).join('');
    const num = (k, unit) => `<label class="field"><span>${esc(t(k))}</span><div class="row"><input type="number" step="any" data-gen="${k}" value="${g[k]}" class="grow"><span class="small muted">${unit}</span></div></label>`;
    return `<div class="card"><h2>${esc(t('general'))}</h2>
      <label class="field"><span>${esc(t('a_name'))}</span><input type="text" data-gen="Name" value="${esc(g.Name)}"></label>
      <div class="grid2">
        <label class="field"><span>${esc(t('period'))} — ${esc(t('from'))}</span><input type="date" data-gen="AssessmentPeriodStart" value="${esc(g.AssessmentPeriodStart)}"></label>
        <label class="field"><span>${esc(t('to'))} (${A().fmt(Global.Days())} ${esc(t('days'))})</span><input type="date" data-gen="AssessmentPeriodEnd" value="${esc(g.AssessmentPeriodEnd)}"></label>
        <label class="field"><span>${esc(t('country'))}</span><select data-gen="Country"><option value=""></option>${countries.map(c => `<option ${c === g.Country ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="field"><span>${esc(t('currency'))}</span><input type="text" data-gen="Currency" value="${esc(g.Currency)}" maxlength="3"></label>
      </div>
      <label class="field"><span>${esc(t('gwp'))}</span><select id="gwp-select">${gwp}</select></label>
      <div class="grid2">
        ${num('conv_kwh_co2', 'kgCO₂/kWh')}
        ${num('prot_con', 'kg/person/year')}
        ${num('bod_pday', 'g/person/day')}
        ${num('F_IND_COM', 'kgN/kgN')}
        ${num('F_NON_CON', 'kgN/kgN')}
        ${num('N_HH', 'kgN/kgN')}
      </div>
      <label class="field"><span>${esc(t('comments'))}</span><textarea class="field" data-gen="Comments" rows="3">${esc(g.Comments)}</textarea></label>
    </div>`;
  }

  function stagePanel(level) {
    const { t, esc } = A();
    const obj = Global[level];
    const codes = Object.keys(obj).filter(k => typeof obj[k] === 'number');
    return `<div class="card"><h2>${esc(A().stageLabel(level))} — ${esc(t('stage_level_inputs'))}</h2>
      <table class="inputs"><tbody>${codes.map(c => inputRow(c, obj)).join('')}</tbody></table></div>`;
  }

  function substagePanel(sel) {
    const { t, esc } = A();
    const ss = sel.obj, struct = sel.struct;
    const codes = Object.keys(ss).filter(k => typeof ss[k] === 'number' && !Questions.is_inside(k));
    const qs = Questions.get_questions(ss);
    return `<div class="card">
      <div class="row" style="margin-bottom:8px"><h2 class="grow" style="margin:0">${esc(A().stageLabel(struct.prefix))} · ${esc(ss.name)}</h2>
        <button class="btn sm" data-act="fill-est" title="${esc(t('est_summary_note'))}">${esc(t('est_fill'))}</button>
        <button class="btn sm" data-act="rename-ss">${esc(t('rename'))}</button>
        <button class="btn sm danger" data-act="delete-ss">${esc(t('delete'))}</button></div>
      <h3>${esc(t('inputs'))}</h3>
      <table class="inputs"><tbody>${codes.map(c => inputRow(c, ss)).join('')}${qs.map(q => questionBlock(q, ss)).join('')}</tbody></table>
    </div>
    <div class="card"><h3>${esc(t('outputs'))}</h3><div id="ss-outputs">${outputsTable(struct, ss)}</div></div>`;
  }

  function stageNav(sel) {
    const { t, esc } = A();
    let html = `<button class="st gen ${sel.kind === 'general' ? 'on' : ''}" data-sel="general">${esc(t('general'))}</button>`;
    for (const level of ['Water', 'Waste']) {
      html += `<div class="lvl ${level}"><button class="link" style="color:inherit;text-decoration:none;font-weight:700" data-sel="stage:${level}">${esc(A().stageLabel(level))}</button></div>`;
      for (const s of STAGES().filter(x => x.level === level)) {
        html += `<div class="st"><span>${esc(A().stageLabel(s.prefix))}</span><button class="btn sm add" data-add="${s.prefix}" title="${esc(t('add_substage'))}" aria-label="${esc(t('add_substage'))}: ${esc(A().stageLabel(s.prefix))}">+</button></div>`;
        Global[s.level][s.sublevel].forEach((ss, i) => {
          const on = sel.kind === 'ss' && sel.prefix === s.prefix && sel.index === i;
          html += `<button class="ss ${on ? 'on' : ''}" data-sel="ss:${s.prefix}:${i}">${esc(ss.name)}</button>`;
        });
      }
    }
    return html;
  }

  // --- main renderer -------------------------------------------------------
  function renderEntry(root) {
    const { t, esc, state } = A();
    const sel = selected();
    const opts = Scenarios.map((s, i) => `<option value="${i}" ${i === state.current ? 'selected' : ''}>${esc(s.General.Name)}</option>`).join('');
    let panel;
    if (sel.kind === 'ss') panel = substagePanel(sel);
    else if (sel.kind === 'stage') panel = stagePanel(sel.level);
    else panel = generalPanel();
    const anySubstage = STAGES().some(s => Global[s.level][s.sublevel].length);
    root.innerHTML = `
      <div class="page-head"><h1>${esc(t('enter_ecam'))}</h1></div>
      <div class="card"><div class="row">
        <label class="small muted">${esc(t('assessments'))}</label>
        <select id="sc-select" style="width:auto;min-width:220px">${opts}</select>
        <button class="btn sm" data-act="new-sc">${esc(t('new_assessment'))}</button>
        <button class="btn sm" data-act="dup-sc">${esc(t('duplicate'))}</button>
        <button class="btn sm danger" data-act="del-sc" ${Scenarios.length < 2 ? 'disabled' : ''}>${esc(t('delete'))}</button>
        <span class="spacer"></span>
        <label class="btn sm">${esc(t('load_file'))}<input type="file" accept=".json,application/json" id="load-ecam" hidden></label>
        <button class="btn sm" data-act="save-ecam">${esc(t('save_file'))}</button>
        <button class="btn sm" data-act="load-sample">${esc(t('load_sample'))}</button>
      </div></div>
      <div class="kpis" id="kpis">${kpis()}</div>
      <div class="ecam">
        <nav class="stagenav" id="stagenav">${stageNav(sel)}</nav>
        <div id="panel">${!anySubstage && sel.kind === 'general' ? `<div class="notice">${esc(t('no_substages'))}</div>` : ''}${panel}
          <div class="actions-row"><button class="btn" data-go="assess:choose">${esc(t('back'))}</button><button class="btn primary" data-go="assess:results">${esc(t('view_results'))}</button></div>
        </div>
      </div>`;
    bindEntry(root, sel);
  }

  function refreshLive(sel) {
    document.getElementById('kpis').innerHTML = kpis();
    if (sel.kind === 'ss') {
      const out = document.getElementById('ss-outputs');
      if (out) out.innerHTML = outputsTable(sel.struct, sel.obj);
    }
    A().save();
  }

  function bindEntry(root, sel) {
    const app = A();
    const stage = sel.obj;
    const entered = (code, origin) => { if (sel.kind === 'ss') app.markEntered(sel.struct.prefix, stage, code, origin); };
    root.onchange = root.oninput = null;

    root.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.kind === 'num' && stage) {
        const v = parseFloat(el.value);
        stage[el.dataset.code] = Number.isFinite(v) ? v * mult(el.dataset.code) : 0;
        entered(el.dataset.code);
        refreshLive(sel);
      } else if (el.dataset.gen && el.tagName !== 'SELECT') {
        const k = el.dataset.gen;
        if (el.type === 'number') {
          Global.General[k] = parseFloat(el.value) || 0;
          if (k === 'conv_kwh_co2') applyGridFactor();
        } else Global.General[k] = el.value;
        if (k === 'Name') document.querySelector(`#sc-select option[value="${app.state.current}"]`).textContent = el.value;
        refreshLive(sel);
      }
    });

    root.addEventListener('change', e => {
      const el = e.target;
      if (el.id === 'sc-select') { app.setCurrent(+el.value); return app.render(); }
      if (el.id === 'gwp-select') { app.setGwp(+el.value); return refreshLive(sel); }
      if (el.id === 'load-ecam') return loadEcamFile(el);
      if (el.dataset.gen === 'Country') {
        const c = Countries[el.value];
        Global.General.Country = el.value;
        if (c) {
          Object.assign(Global.General, { Currency: c.currency, conv_kwh_co2: c.conv_kwh_co2, prot_con: c.prot_con, bod_pday: c.bod_pday });
          applyGridFactor();
        }
        app.save(); return app.render();
      }
      if ((el.dataset.gen === 'AssessmentPeriodStart' || el.dataset.gen === 'AssessmentPeriodEnd')) { app.save(); return app.render(); }
      if (el.dataset.kind === 'option') { stage[el.dataset.code] = parseInt(el.value, 10); entered(el.dataset.code); return refreshLive(sel); }
      if (el.dataset.kind === 'exception' && el.value !== '') {
        stage[el.dataset.code] = parseFloat(el.value);
        entered(el.dataset.code, 'typical');
        app.save(); return app.render();
      }
      if (el.dataset.q) { setQuestion(stage, el.dataset.q, el.value === '1'); app.save(); return app.render(); }
    });

    root.addEventListener('click', e => {
      const b = e.target.closest('button, [data-sel]');
      if (!b) return;
      if (b.dataset.sel) {
        const [kind, a, i] = b.dataset.sel.split(':');
        app.state.ui.sel = kind === 'ss' ? { kind, prefix: a, index: +i } : kind === 'stage' ? { kind, level: a } : { kind: 'general' };
        app.save(); app.render(); return;
      }
      if (b.dataset.add) return addSubstage(b.dataset.add);
      if (b.dataset.help) { const h = document.getElementById('help_' + b.dataset.help); h.hidden = !h.hidden; return; }
      if (b.dataset.ask) {
        const sid = app.state.ui.sel?.kind === 'ss' ? app.idOf(stage, 's') : null;
        return app.askChat(`${app.t('ask_chat')}: ${labelOf(b.dataset.ask)} (${b.dataset.ask})`, { kind: 'input', code: b.dataset.ask, sid, label: `${b.dataset.ask} · ${String(labelOf(b.dataset.ask)).replace(/<[^>]+>/g, '')}` });
      }
      if (b.dataset.est) {
        stage[b.dataset.code] = parseFloat(b.dataset.est); entered(b.dataset.code, 'estimate');
        if (sel.kind === 'ss') app.recordEstimate(stage, b.dataset.code);
        app.save(); return app.render();
      }
      const act = b.dataset.act;
      if (act === 'fill-est' && sel.kind === 'ss') {
        const n = app.fillEstimates(sel.struct.prefix, stage);
        app.toast(n ? app.t('est_fill_done').replace('{n}', n) : app.t('est_fill_none'));
        app.save(); return app.render();
      }
      if (act === 'new-sc') { app.newScenario(); return app.render(); }
      if (act === 'dup-sc') { app.duplicateScenario(); return app.render(); }
      if (act === 'del-sc') { if (confirm(app.t('confirm_delete'))) { app.deleteScenario(); app.render(); } return; }
      if (act === 'save-ecam') return app.download(JSON.stringify(Scenarios, null, 2), Scenarios.map(s => s.General.Name).join('+') + '.json', 'application/json');
      if (act === 'load-sample') return app.loadSample();
      if (act === 'rename-ss') { const n = prompt(app.t('rename'), stage.name); if (n) { stage.name = n; app.save(); app.render(); } return; }
      if (act === 'delete-ss') {
        if (!confirm(app.t('confirm_delete'))) return;
        const list = Global[sel.struct.level][sel.struct.sublevel];
        list.splice(sel.index, 1);
        app.state.ui.sel = { kind: 'general' }; app.save(); app.render();
      }
    });
  }

  function applyGridFactor() {
    STAGES().forEach(s => Global[s.level][s.sublevel].forEach(ss => { ss[s.prefix + '_conv_kwh'] = Global.General.conv_kwh_co2; }));
  }

  function addSubstage(prefix) {
    const app = A();
    const s = Structure.find(x => x.prefix === prefix);
    const list = Global[s.level][s.sublevel];
    const ss = new s.class(`${app.stageLabel(prefix)} ${list.length + 1}`);
    ss[prefix + '_conv_kwh'] = Global.General.conv_kwh_co2;
    list.push(ss);
    app.state.ui.sel = { kind: 'ss', prefix, index: list.length - 1 };
    app.save(); app.render();
  }

  function loadEcamFile(input) {
    const app = A();
    const file = input.files[0];
    input.value = ''; // the same file can be chosen again, including after a failed import
    if (!file) return;
    file.text().then(text => app.importEcamText(text), () => app.toast(app.t('import_not_json')));
  }

  // --- results view ---------------------------------------------------------
  function stageTotals(sc) {
    return STAGES().map(s => {
      const list = sc[s.level][s.sublevel];
      const sum = k => list.map(ss => safeNum(() => ss[s.prefix + '_KPI_GHG']()[k]) || 0).reduce((a, b) => a + b, 0);
      return { prefix: s.prefix, level: s.level, n: list.length, co2: sum('co2'), ch4: sum('ch4'), n2o: sum('n2o'), total: sum('total'),
        kwh: list.map(ss => ss[s.prefix + '_nrg_cons'] || 0).reduce((a, b) => a + b, 0) };
    });
  }

  function renderResults(root) {
    const { t, esc, fmt } = A();
    const g = Global.TotalGHG(), e = Global.TotalNRG();
    const rows = stageTotals(Global);
    const subs = STAGES().flatMap(s => Global[s.level][s.sublevel].map(ss => ({ s, ss, ghg: safeNum(() => ss[s.prefix + '_KPI_GHG']().total) || 0 })));
    subs.sort((a, b) => b.ghg - a.ghg);
    const gp = GWP_reports[A().state.gwpIndex] || GWP_reports[0];
    const ctx = A().cardCtx(A().idOf(Global));
    const related = A().relatedActions(Global);
    const sourcesCell = x => AS.COMPONENTS[x.s.prefix]
      .map(c => ({ c, kg: safeNum(() => x.ss[`${x.s.prefix}_KPI_GHG_${c}`]().total) }))
      .filter(v => v.kg)
      .map(v => `<div>${DC.componentLabel(x.s.prefix, v.c, ctx)} ${fmt(v.kg / 1000)}</div>`).join('') || '–';
    const relatedCell = x => esc((related.bySid[A().idOf(x.ss, 's')] || []).join(', ') || '–');
    root.innerHTML = `
      <div class="page-head"><h1>${esc(t('results_title'))} · ${esc(Global.General.Name)}</h1>
        <p class="muted">${esc(t('results_sub'))} ${esc(Global.General.AssessmentPeriodStart)} – ${esc(Global.General.AssessmentPeriodEnd)} · ${esc(gp.report)} · ${Global.General.conv_kwh_co2} kgCO₂/kWh</p>
        <div class="chat-entry"><button type="button" class="btn sm" data-chat="result">${esc(t('chat_btn_results'))}</button><button type="button" class="btn sm" data-chat="missing">${esc(t('chat_btn_missing'))}</button></div></div>
      <div class="kpis">${kpis()}</div>
      ${A().responsibilityHtml(Global, ctx)}
      ${FU.estimatesSummary(A().estimatesList(Global), A().fuCtx())}
      <div class="card"><h2>${esc(t('by_stage'))}</h2>
        <div class="chart-box"><canvas id="chart-stages" aria-label="${esc(t('by_stage'))}"></canvas></div>
        <div class="legend"><span><i style="background:var(--co2)"></i>CO₂</span><span><i style="background:var(--ch4)"></i>CH₄ (CO₂eq)</span><span><i style="background:var(--n2o)"></i>N₂O (CO₂eq)</span></div>
      </div>
      <details class="card" data-detail-tables><summary><b>${esc(t('results_details'))}</b></summary>
      <div style="overflow:auto"><table class="data"><thead><tr><th>${esc(t('stage'))}</th><th class="num">${t('tco2')}</th><th class="num">CO₂</th><th class="num">CH₄</th><th class="num">N₂O</th><th class="num">${esc(t('energy'))}</th><th class="num">${esc(t('share'))}</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${esc(A().stageLabel(r.prefix))} <span class="muted small">(${r.n})</span></td><td class="num">${fmt(r.total / 1000)}</td><td class="num">${fmt(r.co2 / 1000)}</td><td class="num">${fmt(r.ch4 / 1000)}</td><td class="num">${fmt(r.n2o / 1000)}</td><td class="num">${fmt(r.kwh)}</td><td class="num">${g.total ? fmt(100 * r.total / g.total, 1) + '%' : '–'}</td></tr>`).join('')}
        <tr style="font-weight:700"><td>Total</td><td class="num">${fmt(g.total / 1000)}</td><td class="num">${fmt(g.co2 / 1000)}</td><td class="num">${fmt(g.ch4 / 1000)}</td><td class="num">${fmt(g.n2o / 1000)}</td><td class="num">${fmt(e)}</td><td class="num">100%</td></tr>
      </tbody></table></div>
      <h2 style="margin-top:16px">${esc(t('substage'))}</h2><div style="overflow:auto"><table class="data"><thead><tr><th>${esc(t('substage'))}</th><th>${esc(t('stage'))}</th><th class="num">${t('tco2')}</th><th class="num">${esc(t('share'))}</th><th>${esc(t('sources_col'))} (tCO₂eq)</th><th>${esc(t('related_actions_col'))}</th></tr></thead><tbody>
        ${subs.map(x => `<tr data-substage="${esc(A().idOf(x.ss, 's'))}"><td>${esc(x.ss.name)}<br><button type="button" class="link small" data-chat="result" data-sid="${esc(A().idOf(x.ss, 's'))}">${esc(t('chat_btn_result'))}</button></td><td><i class="sw sw-${x.s.prefix}" aria-hidden="true"></i>${esc(A().stageLabel(x.s.prefix))}</td><td class="num">${fmt(x.ghg / 1000)}</td><td class="num">${g.total ? fmt(100 * x.ghg / g.total, 1) + '%' : '–'}</td>
          <td class="small">${sourcesCell(x)}</td><td class="small" data-related>${relatedCell(x)}</td></tr>`).join('')}
      </tbody></table></div>
      ${related.status === 'outdated' ? `<p class="small muted">${esc(t('related_outdated'))}</p>` : ''}</details>
      <div class="actions-row"><button class="btn" data-go="assess:entry">${esc(t('back_to_data'))}</button><button class="btn primary" data-act="finish">${esc(t('finish_assessment'))}</button></div>`;
    drawChart(rows);
    root.querySelector('[data-act=finish]').onclick = () => A().finishAssessment();
    root.querySelectorAll('[data-act=edit-profile]').forEach(b => b.onclick = () => A().openProfile());
  }

  let chart;
  function drawChart(rows) {
    if (!window.Chart) return;
    const css = getComputedStyle(document.documentElement);
    const c = k => css.getPropertyValue(k).trim();
    if (chart) chart.destroy();
    chart = new Chart(document.getElementById('chart-stages'), {
      type: 'bar',
      data: {
        labels: rows.map(r => A().stageLabel(r.prefix)),
        datasets: [
          { label: 'CO₂', data: rows.map(r => r.co2 / 1000), backgroundColor: c('--co2') },
          { label: 'CH₄', data: rows.map(r => r.ch4 / 1000), backgroundColor: c('--ch4') },
          { label: 'N₂O', data: rows.map(r => r.n2o / 1000), backgroundColor: c('--n2o') },
        ],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => `${x.dataset.label}: ${A().fmt(x.raw)} tCO₂eq` } } },
        scales: { x: { stacked: true, title: { display: true, text: 'tCO₂eq' }, grid: { color: '#E9EFF1' } }, y: { stacked: true, grid: { display: false } } },
      },
    });
  }

  return { renderEntry, renderResults, stageTotals, labelOf };
})();
