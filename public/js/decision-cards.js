/*
 * Stage 2 decision cards and the data-checks panel (HTML only, no state).
 * Shared by the browser (global DC) and the tests. Everything shown comes from the
 * option and check objects produced by engine/actions.js; nothing is inferred here.
 *
 * ctx: { t, L, esc, fmt, labelOf(code), unitView(code) -> { unit, mult }, status(sid, code, value) -> CW.inputState,
 *        stageLabel(prefix)?, substageName(sid)? }
 * Input values arrive in ECAM base units; unitView is the Stage 1 conversion (shown = stored / mult).
 * What an action addresses and its emission classification come from action-sources.js (AS).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cw-core'), require('./action-sources'));
  else root.DC = factory(root.CW, root.AS);
})(typeof self !== 'undefined' ? self : this, function (CW, AS) {
  const { needsConfirm } = CW;
  const COVERED_RULES = ['pump_upgrade', 'pump_audit', 'nrw_reduction', 'septic_desludging'];
  const OTHER_RULES = ['cso_reduction', 'biogas_capture', 'fuel_switch', 'solar_pv'];

  const optionSid = o => (o.key ? String(o.key).split('|')[2] : null);
  /** The covered check behind an option, matched by rule and substage ID. */
  const checkFor = (o, checks) => (checks || []).find(c => c.rules.includes(o.rule) && c.sid === optionSid(o)) || null;

  function benefit(o, ctx) {
    const { t, L, esc, fmt } = ctx;
    if (CW.isCustom(o)) {
      return `<span data-ghg-status="not_quantified">${esc(t('ghg_not_quantified'))}</span> · <span data-kwh-status="not_quantified">${esc(t('energy_not_quantified'))}</span>`;
    }
    const parts = [];
    if (o.expected_kgco2 && AS.isQuantified(o, 'ghg')) parts.push(`${fmt(o.expected_kgco2 / 1000, 0)} tCO₂eq`);
    if (o.expected_kwh && AS.isQuantified(o, 'kwh')) parts.push(`${fmt(o.expected_kwh)} kWh`);
    if (!parts.length) return esc(L(o.expected_text) || '–');
    return esc(parts.join(' · ')) + (o.scenario ? ` <span class="muted small">(${esc(t('scenario_short'))})</span>` : '')
      + (o.rule !== 'baseline' && !AS.isQuantified(o, 'kwh') ? ` <span class="muted small" data-kwh-status="not_quantified">· ${esc(t('energy_not_quantified'))}</span>` : '');
  }

  function valueLabel(v, ctx) { return v.code ? ctx.labelOf(v.code) : ctx.t('tv_' + v.label); }
  function valuesList(values, ctx) {
    const { esc, fmt } = ctx;
    if (!values || !values.length) return '';
    const shown = n => fmt(n, typeof n === 'number' && n !== 0 && Math.abs(n) < 10 ? 3 : undefined);
    return `<ul class="dc-values">${values.map(v => `<li data-value="${esc(v.code || v.label)}">${valueLabel(v, ctx)}: <b>${esc(shown(v.value))}</b> ${esc(v.unit || '')}</li>`).join('')}</ul>`;
  }

  /** Value and unit as the Stage 1 form shows them. */
  function shown(code, value, ctx) {
    const u = ctx.unitView ? ctx.unitView(code) : { unit: '', mult: 1 };
    return { text: value == null ? '–' : ctx.fmt(value / (u.mult || 1)), unit: String(u.unit || '').replace(/\bm3\b/g, 'm³') };
  }
  const userSet = s => s.confirmed || s.origin === 'manual';
  function statusText(s, t) {
    return [t('in_' + s.origin), s.confirmed ? t('in_confirmed') : s.origin === 'manual' ? null : t('in_not_confirmed')].filter(Boolean).join(' · ');
  }
  const stateOf = (check, code, ctx) => ctx.status(check.sid, code, (check.inputs.find(i => i.code === code) || {}).value ?? null);

  /** Input rows with origin, confirmation and a confirm button for anything not entered manually or confirmed. */
  function inputRows(check, ctx) {
    const { t, esc } = ctx;
    return `<ul class="dc-inputs">${check.inputs.map(i => {
      const s = ctx.status(check.sid, i.code, i.value), v = shown(i.code, i.value, ctx);
      return `<li data-input="${esc(i.code)}" data-input-origin="${s.origin}" data-input-confirmed="${s.confirmed}">${ctx.labelOf(i.code)}: <b>${esc(v.text)}</b> ${esc(v.unit)}
        <span class="in-st in-${s.origin}${s.confirmed ? ' in-confirmed' : ''}">${esc(statusText(s, t))}</span>${needsConfirm(s) ? ` <button class="link" data-confirm="${esc(check.sid)}|${esc(i.code)}">${esc(t('confirm_value'))}</button>` : ''}</li>`;
    }).join('')}</ul>`;
  }
  const unconfirmed = (check, ctx) => check ? check.inputs.filter(i => needsConfirm(ctx.status(check.sid, i.code, i.value))).length : 0;

  /** Inputs at zero that block the rule: user-set values are reported as such, never as missing. */
  function zeroSplit(check, ctx) {
    const known = [], unknown = [];
    for (const code of (check && check.missing) || []) (userSet(stateOf(check, code, ctx)) ? known : unknown).push(code);
    return { known, unknown };
  }
  function zeroNotes(check, ctx) {
    const { t, esc } = ctx;
    const { known, unknown } = zeroSplit(check, ctx);
    const notes = known.map(code => {
      const s = stateOf(check, code, ctx), v = shown(code, (check.inputs.find(i => i.code === code) || {}).value ?? null, ctx);
      return `<div data-zero-known="${esc(code)}">${ctx.labelOf(code)}: ${esc(t(s.confirmed ? 'zero_confirmed' : 'zero_entered').replace('{v}', v.text))}</div>`;
    });
    if (unknown.length) notes.push(`<div data-zero-unknown>${esc(t('inputs_zero'))}: ${unknown.map(ctx.labelOf).join('; ')}</div>`);
    return notes.join('');
  }
  function completeness(check, ctx) {
    const { t, esc } = ctx;
    const k = check.inputs.filter(i => userSet(ctx.status(check.sid, i.code, i.value))).length;
    return `<div class="small" data-completeness="${k}/${check.inputs.length}">${esc(t('inputs_complete').replace('{k}', k).replace('{n}', check.inputs.length))}</div>`;
  }
  function untrackedList(check, ctx) {
    const { t, esc } = ctx;
    if (!check.untracked || !check.untracked.length) return '';
    const labels = check.untracked.map(ctx.labelOf);
    const shownLabels = labels.map((l, n) => labels.indexOf(l) !== labels.lastIndexOf(l) ? `${l} (${esc(check.untracked[n])})` : l);
    return `<div class="small" data-untracked>${esc(t('untracked_known'))}: ${shownLabels.join('; ')}</div>`;
  }
  const reviewNotices = (list, ctx) => (list || []).map(r => `<p class="small dc-flag" data-review="${ctx.esc(r)}">${ctx.esc(ctx.t('rv_' + r))}</p>`).join('');

  // ------------------------------------------------------------ sources and classification
  const stageName = (p, ctx) => ctx.stageLabel ? ctx.stageLabel(p) : p;
  /** Classification as text; the colour only repeats it. null = pending review. */
  function classChip(c, ctx) {
    const k = c || 'pending';
    return `<span class="cls cls-${k}" data-classification="${k}" title="${ctx.esc(ctx.t('cls_review_pending'))}">${ctx.esc(ctx.t('cls_' + k))}</span>`;
  }
  function locationText(loc, ctx) {
    const { t, esc } = ctx;
    if (!loc) return '';
    if (loc.at === 'utility') return `<span class="loc">${esc(t('loc_utility'))}</span>`;
    if (loc.at === 'stages') return `<span class="loc">${loc.stages.map(p => `<i class="sw sw-${esc(p)}" aria-hidden="true"></i>${esc(stageName(p, ctx))}`).join(', ')}</span>`;
    const name = loc.sid && ctx.substageName ? ctx.substageName(loc.sid) : null;
    return `<span class="loc"><i class="sw sw-${esc(loc.prefix)}" aria-hidden="true"></i>${esc(stageName(loc.prefix, ctx))}${name ? ` › ${esc(name)}` : ''}</span>`;
  }
  function sourceLabel(s, ctx) {
    return `<span class="src" data-source="${ctx.esc(s.source)}">${classChip(s.classification, ctx)} ${ctx.esc(ctx.t('src_' + s.source))}${s.location.at !== 'substage' ? ` · ${locationText(s.location, ctx)}` : ''}</span>`;
  }
  function addressesLine(o, ctx) {
    const { t, esc } = ctx;
    const d = AS.describe(o);
    if (!d) return '';
    const loc = locationText(d.location, ctx);
    const sources = d.mapped ? d.sources.map(s => sourceLabel(s, ctx)).join(' ') : classChip(null, ctx);
    return `<p class="small dc-line" data-addresses="${esc(d.problem || 'unmapped')}"><span class="muted">${esc(t('addresses'))}:</span> ${esc(t(d.mapped ? 'pb_' + d.problem : 'pb_unmapped'))}${loc ? ` · ${loc}` : ''}</p>
      <p class="small dc-line dc-sources" data-sources>${sources}</p>`;
  }
  function sourceDetails(o, ctx) {
    const { t, esc } = ctx;
    const d = AS.describe(o);
    if (!d) return '';
    const items = d.mapped ? d.sources.map(s => `<div class="small" data-source-detail="${esc(s.source)}">${sourceLabel(s, ctx)}
        <div class="muted">${esc(t('clsb_' + s.source))} ${esc(t('cls_review_' + s.review))}</div></div>`).join('')
      : `<div class="small" data-source-detail="unmapped">${classChip(null, ctx)} ${esc(t('pb_unmapped'))}</div>`;
    const canLink = d.assessmentId && d.location && (d.location.at === 'utility' || d.location.sid);
    return `<dt>${esc(t('emission_source'))}</dt><dd>${items}
      ${canLink ? `<button class="link small" data-goto-source="${esc(o.key)}">${esc(t('show_in_assessment'))}</button>` : ''}</dd>`;
  }
  /** The selected sorting measure for one card, with the qualifiers that belong to that estimate. */
  function measureLine(o, measure, ctx) {
    const { t, L, esc, fmt } = ctx;
    const field = AS.MEASURES[measure];
    if (!field || o.rule === 'baseline') return '';
    const v = o[field];
    const has = AS.isQuantified(o, measure);
    const value = !has ? t(measure === 'kwh' ? 'energy_not_quantified' : 'ghg_not_quantified') : measure === 'ghg' ? `${fmt(v / 1000, 0)} tCO₂eq` : `${fmt(v, 0)} kWh`;
    // expected_text qualifies the GHG figure when there is one (e.g. "Up to …"), so it is not attached to energy
    const textFits = o.expected_text && (measure === 'ghg' || !AS.isQuantified(o, 'ghg'));
    const notes = [has && o.scenario ? t('scenario_short') : null, textFits ? L(o.expected_text) : null].filter(Boolean);
    return `<p class="small dc-line" data-sort-measure="${esc(measure)}" data-quantified="${has}"><span class="muted">${esc(t('measure_' + measure))}:</span> <b>${esc(value)}</b>${notes.length ? ` <span class="muted">(${esc(notes.join(' · '))})</span>` : ''}</p>`;
  }

  /** One row of the results breakdown: an ECAM component with its source label and classification. */
  function componentLabel(prefix, component, ctx) {
    const src = AS.sourceOfOutput(prefix, component);
    const label = src ? ctx.t('src_' + src) : ctx.labelOf(`${prefix}_KPI_GHG_${component}`);
    return `${classChip(src ? AS.SOURCES[src].classification : null, ctx)} <span data-component="${ctx.esc(prefix + '_' + component)}">${src ? ctx.esc(label) : label}</span>`;
  }
  /** Largest assessed contributor (AS.largestContributor result), or why it cannot be shown. */
  function contributor(r, ctx) {
    const { t, esc, fmt } = ctx;
    const head = `<b>${esc(t('largest_contributor'))}</b>`;
    if (!r || r.status !== 'ok') {
      return `<div class="notice small" data-contributor="${esc(r ? r.status : 'none')}">${head}: ${esc(t('contrib_' + (r ? r.status : 'zero_total')))}</div>`;
    }
    const rows = r.top.map(x => `<li data-contributor-row="${esc(x.prefix + '_' + x.component)}">${componentLabel(x.prefix, x.component, ctx)} · ${locationText({ at: 'substage', prefix: x.prefix, sid: x.sid }, ctx)}
      · <b>${esc(fmt(x.kg / 1000, 0))} tCO₂eq</b> · ${esc(t('contrib_share').replace('{p}', fmt(100 * x.share, 1)))}</li>`).join('');
    return `<div class="notice small" data-contributor="ok" data-tied="${r.top.length > 1}">${head}${r.top.length > 1 ? ` (${esc(t('contrib_tie'))})` : ''}:
      <ul class="contrib">${rows}</ul><div class="muted">${esc(t('contrib_note'))}${r.unavailable ? ' ' + esc(t('contrib_unavailable').replace('{n}', r.unavailable)) : ''}</div></div>`;
  }

  /** Read-only chat entry points for one action (only when the caller enables ctx.chat). */
  function chatRow(k, ctx) {
    const { t, esc } = ctx;
    return ctx.chat ? `<div class="chat-entry" data-chat-entry>
      <button type="button" class="btn sm" data-chat="action" data-intent="develop" data-key="${esc(k)}">${esc(t('chat_btn_develop'))}</button>
      <button type="button" class="btn sm" data-chat="action" data-intent="missing" data-key="${esc(k)}">${esc(t('chat_btn_missing'))}</button></div>` : '';
  }

  /**
   * opts: { selected, note, open, checks, explainHtml, measure ('ghg' | 'kwh' when the cards are sorted by it),
   *         compact (move source, condition and input notices into Details), extraHtml (line under the title),
   *         toolsHtml (buttons and panels above the chat row) }
   */
  function card(o, ctx, opts) {
    const { t, L, esc } = ctx;
    const k = o.key, base = o.rule === 'baseline';
    const check = base ? null : checkFor(o, opts.checks);
    const pending = unconfirmed(check, ctx);
    const why = o.trigger ? L(o.trigger.text) : L(o.evidence);
    const secondary = `${addressesLine(o, ctx)}
      <p class="small dc-line"><span class="muted">${esc(t('condition'))}:</span> ${esc(L(o.condition))}</p>
      ${pending ? `<p class="small dc-flag" data-pending="${pending}">${esc(t('inputs_need_confirm').replace('{n}', pending))}</p>` : ''}
      ${reviewNotices(o.trigger && o.trigger.review, ctx)}`;
    return `<div class="card dcard ${opts.selected ? 'sel' : ''}${opts.compact ? ' compact' : ''}" data-card="${esc(k)}">
      <div class="dc-head"><label class="row" style="gap:8px;flex-wrap:nowrap"><input type="checkbox" data-pick="${esc(k)}" ${opts.selected ? 'checked' : ''} ${base ? 'disabled' : ''}>
        <span><b>${esc(o.id)}</b> · ${esc(L(o.title))}</span></label>
        <span class="dc-benefit" data-benefit>${benefit(o, ctx)}</span></div>
      ${opts.extraHtml || ''}
      ${measureLine(o, opts.measure, ctx)}
      <p class="small dc-line" data-why><span class="muted">${esc(t('why_appeared'))}:</span> ${esc(why)}</p>
      ${opts.compact ? '' : secondary}
      ${opts.toolsHtml || ''}
      ${base ? '' : chatRow(k, ctx)}
      <details data-details="${esc(k)}" ${opts.open ? 'open' : ''}><summary>${esc(t('card_details'))}</summary>
        ${opts.compact ? `<div class="dc-secondary">${secondary}</div>` : ''}
        <dl class="dc-dl">
          <dt>${esc(t('why_appeared'))}</dt><dd>${o.trigger ? esc(L(o.trigger.text)) + valuesList(o.trigger.values, ctx) : ''}
            <div class="small"><span class="muted">${esc(t('assessment_data'))}:</span> ${esc(L(o.evidence))}</div></dd>
          <dt>${esc(t('est_benefit'))}</dt><dd>${benefit(o, ctx)}
            ${o.scenario ? `<div class="small"><span class="muted">${esc(t('scenario'))}:</span> ${esc(L(o.scenario))}</div>` : ''}
            <div class="small"><span class="muted">${esc(t('basis'))}:</span> <code>${esc(o.basis)}</code></div></dd>
          ${sourceDetails(o, ctx)}
          ${base ? '' : `<dt>${esc(t('supporting_doc'))}</dt><dd data-support>${esc(t('no_supporting_doc'))}</dd>
          <dt>${esc(t('before_deciding'))}</dt><dd><div class="small"><span class="muted">${esc(t('condition'))}:</span> ${esc(L(o.condition))}</div>
            ${check ? `<div class="small muted">${esc(t('input_status'))}</div>${completeness(check, ctx)}<div class="small">${zeroNotes(check, ctx)}</div>${inputRows(check, ctx)}${untrackedList(check, ctx)}` : `<div class="small muted" data-not-tracked>${esc(t('not_tracked'))}</div>`}</dd>`}
        </dl>
        <textarea class="field small" data-note="${esc(k)}" rows="2" placeholder="${esc(t('notes_placeholder'))}">${esc(opts.note || '')}</textarea>
        ${opts.explainHtml || ''}
      </details>
    </div>`;
  }

  /**
   * A user-proposed action (custom-actions.js) in the same selection list. Only the user's text is shown,
   * as text; it gets no classification, no figures and no rule explanation.
   * opts: { selected, note, open, measure, location: CA.resolveLocation result }
   */
  function customCard(o, ctx, opts) {
    const { t, esc } = ctx;
    const k = o.key, loc = opts.location || { at: 'assessment' };
    const where = loc.at === 'substage' ? locationText({ at: 'substage', prefix: loc.prefix, sid: loc.sid }, ctx)
      : loc.at === 'missing' ? `<span class="dc-flag-inline" data-location-missing>${esc(t('ca_location_review'))}</span>`
        : `<span class="loc">${esc(t('loc_assessment'))}</span>`;
    return `<div class="card dcard dcard-user ${opts.selected ? 'sel' : ''}" data-card="${esc(k)}" data-origin="user">
      <div class="dc-head"><label class="row" style="gap:8px;flex-wrap:nowrap"><input type="checkbox" data-pick="${esc(k)}" ${opts.selected ? 'checked' : ''}>
        <span><b>${esc(o.id)}</b> · ${esc(o.title)}</span></label>
        <span class="dc-benefit" data-benefit>${benefit(o, ctx)}</span></div>
      <p class="small dc-line"><span class="badge-user" data-user-proposed>${esc(t('user_proposed'))}</span> <span class="badge-unreviewed" data-not-reviewed>${esc(t('not_reviewed'))}</span></p>
      ${opts.extraHtml || ''}
      ${measureLine(o, opts.measure, ctx)}
      <p class="small dc-line user-text" data-description><span class="muted">${esc(t('ca_description'))}:</span> ${esc(o.description)}</p>
      ${o.problem ? `<p class="small dc-line user-text" data-problem><span class="muted">${esc(t('ca_problem'))}:</span> ${esc(o.problem)}</p>` : ''}
      <p class="small dc-line" data-location="${esc(loc.at)}"><span class="muted">${esc(t('ca_location'))}:</span> ${where}</p>
      ${loc.at === 'missing' ? `<p class="small dc-flag" data-location-review>${esc(t('ca_location_missing_body'))}</p>` : ''}
      <div class="row" style="gap:6px;margin-top:6px"><button class="btn sm" data-edit-custom="${esc(k)}">${esc(t('ca_edit'))}</button>
        <button class="btn sm danger" data-delete-custom="${esc(k)}">${esc(t('ca_delete'))}</button></div>
      ${opts.toolsHtml || ''}
      ${chatRow(k, ctx)}
      <details data-details="${esc(k)}" ${opts.open ? 'open' : ''}><summary>${esc(t('card_details'))}</summary>
        <dl class="dc-dl">
          <dt>${esc(t('ca_origin'))}</dt><dd>${esc(t('ca_origin_detail'))}</dd>
          <dt>${esc(t('est_benefit'))}</dt><dd>${benefit(o, ctx)}</dd>
          <dt>${esc(t('ca_classification'))}</dt><dd data-classification="none">${esc(t('ca_no_classification'))}</dd>
          <dt>${esc(t('supporting_doc'))}</dt><dd data-support>${esc(t('no_supporting_doc'))}</dd>
        </dl>
        <textarea class="field small" data-note="${esc(k)}" rows="2" maxlength="2000" aria-label="${esc(t('ca_notes'))}" placeholder="${esc(t('notes_placeholder'))}">${esc(opts.note || '')}</textarea>
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
    // a rule blocked only by values the user set itself is "not evaluated", not "information missing"
    const statusKey = c => {
      const z = zeroSplit(c, ctx);
      return c.status === 'not_assessed' && z.known.length && !z.unknown.length ? 'not_evaluated' : c.status;
    };
    const rows = list.map(c => `<tr data-check="${esc(c.check)}" data-check-status="${c.status}">
        <td>${esc(t('check_' + c.check))}<div class="small muted">${esc(c.name)}</div></td>
        <td class="small"><span class="ck-st ck-${statusKey(c)}" data-rule-result="${statusKey(c)}">${esc(t('st_' + statusKey(c)))}</span>
          <div>${reason(c)}</div>${zeroNotes(c, ctx)}${reviewNotices(c.review, ctx)}</td>
        <td class="small">${completeness(c, ctx)}${inputRows(c, ctx)}${untrackedList(c, ctx)}
          ${unconfirmed(c, ctx) > 1 ? `<button class="btn sm" data-confirm-check="${esc(c.check)}|${esc(c.sid)}">${esc(t('confirm_all_check'))}</button>` : ''}</td></tr>`).join('');
    const offered = new Set((options || []).map(o => o.rule));
    const others = OTHER_RULES.map(r => `<li data-other="${r}">${esc(t('rule_' + r))}: ${esc(t(offered.has(r) ? 'other_offered' : 'other_not_offered'))}</li>`).join('');
    return `<div class="card dpanel" data-checks>
      <div class="row"><h2 class="grow" style="margin:0">${esc(t('data_checks'))}</h2>
        <span class="small" data-check-summary>${esc(t('checks_summary').replace('{a}', count('triggered')).replace('{n}', count('not_triggered')).replace('{m}', count('not_assessed')))}</span></div>
      <p class="small muted" style="margin:6px 0">${esc(t('checks_coverage'))}</p>
      ${pending ? `<p class="small dc-flag" data-pending-total="${pending}">${esc(t('inputs_unconfirmed_total').replace('{n}', pending))}</p>` : ''}
      <details data-details="__checks" ${opts.open ? 'open' : ''}><summary>${esc(t('show_checks'))}</summary>
        <table class="data checks"><thead><tr><th>${esc(t('check'))}</th><th>${esc(t('rule_result'))}</th><th>${esc(t('input_completeness'))}</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="small" style="margin-top:10px"><b>${esc(t('other_rules'))}</b> ${esc(t('other_rules_note'))}</p><ul class="small">${others}</ul>
      </details>
    </div>`;
  }

  return { card, customCard, panel, benefit, checkFor, optionSid, shown, needsConfirm, COVERED_RULES, OTHER_RULES, classChip, componentLabel, contributor, locationText };
});
