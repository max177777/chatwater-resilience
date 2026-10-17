/*
 * Stage 2 decision cards and the data-checks panel (HTML only, no state).
 * Shared by the browser (global DC) and the tests. Everything shown comes from the
 * option and check objects produced by engine/actions.js; nothing is inferred here.
 *
 * ctx: { t, L, esc, fmt, labelOf(code), unitOf(code), status(sid, code, value) }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const NEEDS_CONFIRM = ['unconfirmed', 'default'];
  const COVERED_RULES = ['pump_upgrade', 'pump_audit', 'nrw_reduction', 'septic_desludging'];
  const OTHER_RULES = ['cso_reduction', 'biogas_capture', 'fuel_switch', 'solar_pv'];

  const optionSid = o => (o.key ? String(o.key).split('|')[2] : null);
  /** The covered check behind an option, matched by rule and substage ID. */
  const checkFor = (o, checks) => (checks || []).find(c => c.rules.includes(o.rule) && c.sid === optionSid(o)) || null;

  function benefit(o, ctx) {
    const { t, L, esc, fmt } = ctx;
    const parts = [];
    if (o.expected_kgco2) parts.push(`${fmt(o.expected_kgco2 / 1000, 0)} tCO₂eq`);
    if (o.expected_kwh) parts.push(`${fmt(o.expected_kwh)} kWh`);
    if (!parts.length) return esc(L(o.expected_text) || '–');
    return esc(parts.join(' · ')) + (o.scenario ? ` <span class="muted small">(${esc(t('scenario_short'))})</span>` : '');
  }

  function valueLabel(v, ctx) { return v.code ? ctx.labelOf(v.code) : ctx.t('tv_' + v.label); }
  function valuesList(values, ctx) {
    const { esc, fmt } = ctx;
    if (!values || !values.length) return '';
    const shown = n => fmt(n, typeof n === 'number' && n !== 0 && Math.abs(n) < 10 ? 3 : undefined);
    return `<ul class="dc-values">${values.map(v => `<li data-value="${esc(v.code || v.label)}">${valueLabel(v, ctx)}: <b>${esc(shown(v.value))}</b> ${esc(v.unit || '')}</li>`).join('')}</ul>`;
  }

  /** Input rows with entry status and a confirm button for anything not entered or confirmed. */
  function inputRows(check, ctx) {
    const { t, esc, fmt } = ctx;
    return `<ul class="dc-inputs">${check.inputs.map(i => {
      const st = ctx.status(check.sid, i.code, i.value);
      return `<li data-input="${esc(i.code)}" data-input-status="${st}">${ctx.labelOf(i.code)}: <b>${esc(i.value == null ? '–' : fmt(i.value))}</b> ${esc(ctx.unitOf(i.code))}
        <span class="in-st in-${st}">${esc(t('in_' + st))}</span>${NEEDS_CONFIRM.includes(st) ? ` <button class="link" data-confirm="${esc(check.sid)}|${esc(i.code)}">${esc(t('confirm_value'))}</button>` : ''}</li>`;
    }).join('')}</ul>`;
  }
  const unconfirmed = (check, ctx) => check ? check.inputs.filter(i => NEEDS_CONFIRM.includes(ctx.status(check.sid, i.code, i.value))).length : 0;

  /**
   * opts: { selected, note, open, checks, explainHtml }
   */
  function card(o, ctx, opts) {
    const { t, L, esc } = ctx;
    const k = o.key, base = o.rule === 'baseline';
    const check = base ? null : checkFor(o, opts.checks);
    const pending = unconfirmed(check, ctx);
    const why = o.trigger ? L(o.trigger.text) : L(o.evidence);
    return `<div class="card dcard ${opts.selected ? 'sel' : ''}" data-card="${esc(k)}">
      <div class="dc-head"><label class="row" style="gap:8px;flex-wrap:nowrap"><input type="checkbox" data-pick="${esc(k)}" ${opts.selected ? 'checked' : ''} ${base ? 'disabled' : ''}>
        <span><b>${esc(o.id)}</b> · ${esc(L(o.title))}</span></label>
        <span class="dc-benefit" data-benefit>${benefit(o, ctx)}</span></div>
      <p class="small dc-line" data-why><span class="muted">${esc(t('why_appeared'))}:</span> ${esc(why)}</p>
      <p class="small dc-line"><span class="muted">${esc(t('condition'))}:</span> ${esc(L(o.condition))}</p>
      ${pending ? `<p class="small dc-flag" data-pending="${pending}">${esc(t('inputs_need_confirm').replace('{n}', pending))}</p>` : ''}
      <details data-details="${esc(k)}" ${opts.open ? 'open' : ''}><summary>${esc(t('card_details'))}</summary>
        <dl class="dc-dl">
          <dt>${esc(t('why_appeared'))}</dt><dd>${o.trigger ? esc(L(o.trigger.text)) + valuesList(o.trigger.values, ctx) : ''}
            <div class="small"><span class="muted">${esc(t('assessment_data'))}:</span> ${esc(L(o.evidence))}</div></dd>
          <dt>${esc(t('est_benefit'))}</dt><dd>${benefit(o, ctx)}
            ${o.scenario ? `<div class="small"><span class="muted">${esc(t('scenario'))}:</span> ${esc(L(o.scenario))}</div>` : ''}
            <div class="small"><span class="muted">${esc(t('basis'))}:</span> <code>${esc(o.basis)}</code></div></dd>
          ${base ? '' : `<dt>${esc(t('supporting_doc'))}</dt><dd data-support>${esc(t('no_supporting_doc'))}</dd>
          <dt>${esc(t('before_deciding'))}</dt><dd><div class="small"><span class="muted">${esc(t('condition'))}:</span> ${esc(L(o.condition))}</div>
            ${check ? `<div class="small muted">${esc(t('input_status'))}</div>${inputRows(check, ctx)}` : `<div class="small muted" data-not-tracked>${esc(t('not_tracked'))}</div>`}</dd>`}
        </dl>
        <textarea class="field small" data-note="${esc(k)}" rows="2" placeholder="${esc(t('notes_placeholder'))}">${esc(opts.note || '')}</textarea>
        ${opts.explainHtml || ''}
      </details>
    </div>`;
  }

  /** Compact panel: covered checks with status, reasons and input status; other rules as offered or not. */
  function panel(checks, options, ctx, opts = {}) {
    const { t, L, esc } = ctx;
    const list = checks || [];
    const count = s => list.filter(c => c.status === s).length;
    const pending = list.reduce((n, c) => n + unconfirmed(c, ctx), 0);
    const reason = c => c.reason ? esc(t('rs_' + c.reason).replace('{limit}', c.limit == null ? '' : c.limit)) : '';
    const rows = list.map(c => `<tr data-check="${esc(c.check)}" data-check-status="${c.status}">
        <td>${esc(t('check_' + c.check))}<div class="small muted">${esc(c.name)}</div></td>
        <td><span class="ck-st ck-${c.status}">${esc(t('st_' + c.status))}</span></td>
        <td class="small">${reason(c)}${c.missing && c.missing.length ? `<div>${esc(t('inputs_zero'))}: ${c.missing.map(ctx.labelOf).join('; ')}</div>` : ''}
          ${inputRows(c, ctx)}${unconfirmed(c, ctx) > 1 ? `<button class="btn sm" data-confirm-check="${esc(c.check)}|${esc(c.sid)}">${esc(t('confirm_all_check'))}</button>` : ''}</td></tr>`).join('');
    const offered = new Set((options || []).map(o => o.rule));
    const others = OTHER_RULES.map(r => `<li data-other="${r}">${esc(t('rule_' + r))}: ${esc(t(offered.has(r) ? 'other_offered' : 'other_not_offered'))}</li>`).join('');
    return `<div class="card dpanel" data-checks>
      <div class="row"><h2 class="grow" style="margin:0">${esc(t('data_checks'))}</h2>
        <span class="small" data-check-summary>${esc(t('checks_summary').replace('{a}', count('triggered')).replace('{n}', count('not_triggered')).replace('{m}', count('not_assessed')))}</span></div>
      <p class="small muted" style="margin:6px 0">${esc(t('checks_coverage'))}</p>
      ${pending ? `<p class="small dc-flag" data-pending-total="${pending}">${esc(t('inputs_unconfirmed_total').replace('{n}', pending))}</p>` : ''}
      <details data-details="__checks" ${opts.open ? 'open' : ''}><summary>${esc(t('show_checks'))}</summary>
        <table class="data checks"><thead><tr><th>${esc(t('check'))}</th><th>${esc(t('status'))}</th><th>${esc(t('detail'))}</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="small" style="margin-top:10px"><b>${esc(t('other_rules'))}</b> ${esc(t('other_rules_note'))}</p><ul class="small">${others}</ul>
      </details>
    </div>`;
  }

  return { card, panel, benefit, checkFor, optionSid, COVERED_RULES, OTHER_RULES, NEEDS_CONFIRM };
});
