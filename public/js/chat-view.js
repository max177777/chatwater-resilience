/*
 * Chat panel rendering, shared by the browser (global CV) and the tests.
 * Pure functions from a /api/chat response to HTML; every text is escaped.
 * Excerpts are shown exactly as retrieved, with their source ID, locator, role,
 * warnings and qualifications, so the user can check what the assistant saw.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CV = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ROLES = ['team_framework', 'methodology', 'guidance', 'regulation', 'training_example', 'derived_synthesis'];

  function excerpt(p, ctx, tag) {
    const { t, esc } = ctx;
    const role = ROLES.includes(p.role) ? p.role : null;
    const warn = (p.warnings || []).map(w => `<li>${esc(w)}</li>`).join('');
    const quals = (p.qualifications || []).map(q => `<li><b>${esc(q.id)}</b> ${esc(q.title)}: ${esc(q.text)} <span class="muted">(${esc(q.source)}, ${esc(q.locator)})</span></li>`).join('');
    return `<details class="excerpt" data-passage="${esc(p.id)}" data-source="${esc(p.sourceId)}">
      <summary>${tag ? `<b>[${esc(tag)}]</b> ` : ''}${esc(p.title)} · <span data-locator>${esc(p.locatorLabel)}</span>
        ${role ? ` <span class="badge-role role-${role}" data-role="${role}">${esc(t('chat_role_' + role))}</span>` : ''}
        ${p.independent === false ? ` <span class="small muted" data-not-independent>${esc(t('chat_not_independent').replace('{id}', p.related_to || ''))}</span>` : ''}</summary>
      <div class="small muted">${esc(t('chat_source_id'))}: <code>${esc(p.sourceId)}</code>${p.publisher ? ` · ${esc(p.publisher)}` : ''}${p.date ? ` · ${esc(p.date)}` : ''}</div>
      ${p.heading ? `<div class="small"><b>${esc(p.heading)}</b></div>` : ''}
      <blockquote class="quote" data-quote>${esc(p.text)}</blockquote>
      ${warn ? `<div class="small" data-warnings><b>${esc(t('chat_warnings'))}</b><ul>${warn}</ul></div>` : ''}
      ${quals ? `<div class="small" data-qualifications><b>${esc(t('chat_qualifications'))}</b><ul>${quals}</ul></div>` : ''}
      ${p.also_in && p.also_in.length ? `<div class="small muted" data-also-in>${esc(t('chat_also_in').replace('{n}', p.also_in.length))}</div>` : ''}
      ${p.review_status ? `<div class="small muted">${esc(t('chat_review'))}: ${esc(p.review_status)}</div>` : ''}
    </details>`;
  }

  const status = (s, ctx) => s && s.status === 'outdated'
    ? `<span class="badge-outdated">${ctx.esc(ctx.t('chat_status_outdated'))}</span> ${ctx.esc((s.reasons || []).join('; '))}`
    : ctx.esc(s ? (s.status === 'current' ? ctx.t('chat_status_current') : s.status) : '–');

  /** Structured context: the project facts the assistant was given for this question. */
  function contextPanel(c, ctx, open) {
    const { t, esc, fmt } = ctx;
    if (!c) return '';
    const a = c.assessment, r = c.results;
    const missing = (c.missing || []).map(m => {
      if (m.kind === 'rule_check') return `<li>${esc(m.substage)}: ${esc(t('check_' + m.check))} — ${esc((m.missing_inputs || []).join(', ') || t('rs_' + m.reason))}</li>`;
      if (m.kind === 'unconfirmed_inputs') return `<li>${esc(m.substage)}: ${esc(t('chat_unconfirmed'))} ${esc(m.inputs.join(', '))}</li>`;
      if (m.kind === 'utility_profile') return `<li>${esc(t('chat_profile_missing'))}: ${esc(m.fields.join(', '))}</li>`;
      if (m.kind === 'not_computed') return `<li>${esc(t('chat_not_computed'))}: ${esc(m.items.join('; '))}</li>`;
      return '';
    }).join('');
    const fw = c.framework || {};
    const fwRows = [...(fw.stage2 || []).map(x => `<li><b>${esc(x.title)}</b><ul>${x.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul></li>`),
      ...(fw.stage3 || []).map(x => `<li><b>${esc(x.area)}. ${esc(x.title)}</b> — ${esc(x.description)}${x.questions.length ? `<ul>${x.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}</li>`),
      ...(fw.stage4 ? [`<li><b>${esc(t('chat_fw_costs'))}</b>: ${esc(fw.stage4.cost_components.join('; '))}</li><li><b>${esc(t('chat_fw_outputs'))}</b>: ${esc(fw.stage4.outputs.join('; '))}</li>`] : [])].join('');
    return `<details class="ctx-panel" data-context ${open ? 'open' : ''}><summary>${esc(t('chat_context'))}</summary>
      <dl class="dc-dl small">
        <dt>${esc(t('chat_scope'))}</dt><dd data-ctx-assessment="${esc(a ? a.id : '')}">${a ? `${esc(a.name)} · ${esc(a.period ? a.period.start + ' – ' + a.period.end : '')} · ${esc(a.gwp_report || '')}` : esc(t('chat_no_assessment'))}</dd>
        <dt>${esc(t('chat_focus'))}</dt><dd data-ctx-focus>${esc(c.focus.label || c.focus.kind)}${c.focus.ok === false ? ` — <span class="dc-flag-inline">${esc(c.focus.problem)}</span>` : ''}</dd>
        ${r ? `<dt>${esc(t('chat_results'))}</dt><dd>${esc(fmt(r.total_tco2eq))} tCO₂eq · ${esc(fmt(r.energy_kwh))} kWh</dd>` : ''}
        ${c.freshness && c.freshness.actions ? `<dt>${esc(t('chat_freshness'))}</dt><dd data-ctx-freshness>${esc(t('chat_fresh_actions'))}: ${status(c.freshness.actions, ctx)}<br>${esc(t('chat_fresh_plan'))}: ${status(c.freshness.plan, ctx)}<br>${esc(t('chat_fresh_proposal'))}: ${status(c.freshness.proposal, ctx)}</dd>` : ''}
        ${(c.problems || []).length ? `<dt>${esc(t('chat_problems'))}</dt><dd data-ctx-problems>${c.problems.map(esc).join('<br>')}</dd>` : ''}
        ${missing ? `<dt>${esc(t('chat_missing'))}</dt><dd><ul>${missing}</ul></dd>` : ''}
        ${fwRows ? `<dt>${esc(t('chat_framework'))}</dt><dd data-ctx-framework><div class="muted">${esc(fw.review_status || '')}</div><ul>${fwRows}</ul></dd>` : ''}
      </dl></details>`;
  }

  /** One assistant message from a /api/chat response. */
  function assistant(m, ctx) {
    const { t, esc } = ctx;
    const ret = m.retrieval || { status: 'none', passages: [] };
    const other = m.context && m.context.mentions_other && m.context.mentions_other.length
      ? `<div class="notice small warn" data-other-assessment>${esc(t('chat_other_assessment').replace('{names}', m.context.mentions_other.join(', ')).replace('{current}', (m.context.assessment && m.context.assessment.name) || '–'))}</div>` : '';
    const focusProblem = m.context && m.context.focus && m.context.focus.ok === false
      ? `<div class="notice small warn" data-focus-problem>${esc(t('chat_focus_problem').replace('{p}', m.context.focus.problem))}</div>` : '';
    const dropped = m.scope && m.scope.history_dropped ? `<div class="small muted" data-history-dropped>${esc(t('chat_history_dropped').replace('{n}', m.scope.history_dropped))}</div>` : '';
    const hint = m.context && m.context.assessment ? ` ${esc(t('chat_project_data_hint'))}` : '';
    const noPassage = ret.status === 'unavailable'
      ? `<div class="small" data-library-unavailable><b>${esc(t('chat_library_unavailable'))}</b>${hint}</div>`
      : `<div class="small" data-no-passage><b>${esc(t('chat_no_passage'))}</b>${hint}</div>`;
    const searched = ret.query ? `<div class="small muted" data-searched="${esc(ret.query_from || '')}">${esc(t('chat_searched'))}: ${esc(ret.query.slice(0, 160))}</div>` : '';
    if (m.error) return `<div class="msg bot" data-chat-error>${esc(m.content)}</div>`;
    if (m.ai === false) {
      return `<div class="msg bot" data-ai="off"><div class="notice small" data-ai-off-label>${esc(t('chat_ai_off_head'))}</div>${other}${focusProblem}${searched}
        ${ret.status === 'found' ? `<div class="small"><b>${esc(t('chat_excerpts'))}</b></div>${ret.passages.map(p => excerpt(p, ctx)).join('')}` : noPassage}
        ${contextPanel(m.context, ctx, false)}</div>`;
    }
    const support = (m.support || []).map(s => s.status === 'unknown_source' ? '' :
      `<li data-support="${esc(s.status)}">[${esc(s.id)}] ${esc(t(s.status === 'low_overlap' ? 'chat_support_low' : 'chat_support_overlap').replace('{p}', Math.round(100 * s.overlap)))}</li>`).join('');
    return `<div class="msg bot" data-ai="on"><div class="small muted" data-ai-label>${esc(t('chat_ai_answer_label'))}</div>${other}${focusProblem}${dropped}
      <div class="reply">${esc(m.content)}</div>
      ${(m.sources || []).length ? `<div class="small"><b>${esc(t('chat_cited'))}</b></div>${m.sources.map(p => excerpt(p, ctx, p.tag)).join('')}` : ''}
      ${(m.unknown_tags || []).length ? `<div class="small dc-flag" data-unknown-tags>${esc(t('chat_unknown_tag').replace('{list}', m.unknown_tags.join(', ')))}</div>` : ''}
      ${support ? `<ul class="small muted support">${support}</ul>` : ''}${searched}
      ${ret.status === 'none' || ret.status === 'unavailable' ? noPassage : (ret.passages.length > (m.sources || []).length ? `<details class="small"><summary>${esc(t('chat_excerpts'))} (${ret.passages.length})</summary>${ret.passages.map((p, i) => excerpt(p, ctx, 'S' + (i + 1))).join('')}</details>` : '')}
      ${contextPanel(m.context, ctx, false)}</div>`;
  }

  /** Header line: which assessment and item the chat is about. */
  function scope({ name, focusLabel, ai }, ctx) {
    const { t, esc } = ctx;
    return `<div class="chat-scope-line"><span class="muted">${esc(t('chat_scope'))}:</span> <b data-scope-assessment>${esc(name || t('chat_no_assessment'))}</b></div>
      ${focusLabel ? `<div class="chat-scope-line"><span class="muted">${esc(t('chat_focus'))}:</span> <span data-scope-focus>${esc(focusLabel)}</span> <button type="button" class="link small" data-chat-unfocus>${esc(t('chat_focus_clear'))}</button></div>` : ''}
      <div class="small muted" data-readonly>${esc(t('chat_readonly'))}${ai ? '' : ' ' + esc(t('chat_ai_off_short'))}</div>`;
  }

  return { excerpt, contextPanel, assistant, scope };
});
