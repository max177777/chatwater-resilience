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
  const CWmod = () => (typeof module === 'object' && module.exports ? require('./cw-core') : (typeof self !== 'undefined' ? self.CW : null));
  const gwpText = (r, lang) => { const cw = CWmod(); return cw && cw.gwpLabel ? cw.gwpLabel(r, lang) : (r || ''); };
  const SN = () => (typeof module === 'object' && module.exports ? require('./source-notes') : (typeof self !== 'undefined' ? self.SN : null));

  /** A source note in the interface language; notes without a translation are marked as the original English. */
  function noteHtml(text, ctx, kind) {
    const sn = SN();
    const r = sn ? (kind === 'date' ? sn.date(text, ctx.lang) : sn.localize(text, ctx.lang)) : { text, original: false };
    return `${ctx.esc(r.text)}${r.original ? ` <span class="muted" data-original-en>(${ctx.esc(ctx.t('original_english'))})</span>` : ''}`;
  }
  const locatorText = (p, ctx) => { const sn = SN(); return (sn && p.locator && sn.locator(p.locator, ctx.lang)) || p.locatorLabel || ''; };

  /** Every qualification of a source: a one-line summary that opens to the full list. */
  function qualificationsHtml(review, notes, ctx, attr = 'data-source-notes') {
    const items = [...(review ? [`<li data-review-status><b>${ctx.esc(ctx.t('chat_review'))}:</b> ${noteHtml(review, ctx)}</li>`] : []), ...notes.map(w => `<li>${noteHtml(w, ctx)}</li>`)];
    if (!items.length) return '';
    return `<details class="small src-notes" ${attr}><summary><b>${ctx.esc(ctx.t('chat_warnings'))}</b> (${items.length})</summary><ul>${items.join('')}</ul></details>`;
  }

  /** Link to the source, opened at the cited page when the locator has one (PDF viewers honour #page=N). */
  const pageUrl = p => { const page = p.locator && p.locator.page; return page && !String(p.url).includes('#') ? `${p.url}#page=${page}` : p.url; };
  /** One source as a short line: title, page and a link to open it; the quoted passage is one click away. */
  function sourceLine(p, ctx, tag) {
    const { t, esc } = ctx;
    const role = ROLES.includes(p.role) ? p.role : null;
    return `<li class="src-line" data-passage="${esc(p.id || p.passage_id || '')}" data-source="${esc(p.sourceId || p.source_id || '')}"><details><summary>📄 ${tag ? `<b>[${esc(tag)}]</b> ` : ''}${esc(p.title)}${locatorText(p, ctx) ? ` · <span data-locator>${esc(locatorText(p, ctx))}</span>` : ''}${role ? ` <span class="badge-role role-${role}" data-role="${role}">${esc(t('chat_role_' + role))}</span>` : ''}</summary><blockquote class="quote" data-quote>${esc(p.text || '')}</blockquote></details>${p.url ? ` <a href="${esc(pageUrl(p))}" target="_blank" rel="noopener" data-source-link>${esc(t('chat_open_source'))} ↗</a>` : ''}</li>`;
  }
  function excerpt(p, ctx, tag) {
    const { t, esc } = ctx;
    const role = ROLES.includes(p.role) ? p.role : null;
    const quals = (p.qualifications || []).map(q => `<li><b>${esc(q.id)}</b> ${esc(q.title)}: ${esc(q.text)} <span class="muted">(${esc(q.source)}, ${esc(q.locator)})</span></li>`).join('');
    const related = p.related_to ? ((ctx.titleOf && ctx.titleOf(p.related_to)) || p.related_to) : '';
    const original = p.language && ctx.lang && p.language !== ctx.lang;
    return `<details class="excerpt" data-passage="${esc(p.id)}" data-source="${esc(p.sourceId)}">
      <summary>${tag ? `<b>[${esc(tag)}]</b> ` : ''}${esc(p.title)} · <span data-locator>${esc(locatorText(p, ctx))}</span>
        ${role ? ` <span class="badge-role role-${role}" data-role="${role}">${esc(t('chat_role_' + role))}</span>` : ''}
        ${p.independent === false ? ` <span class="small muted" data-not-independent>${esc(t('chat_not_independent').replace('{id}', related))}</span>` : ''}</summary>
      <div class="small muted">${esc(t('chat_source_id'))}: <code>${esc(p.sourceId)}</code>${p.publisher ? ` · ${esc(p.publisher)}` : ''}${p.date ? ` · ${noteHtml(p.date, ctx, 'date')}` : ''}</div>
      ${p.heading ? `<div class="small"><b>${esc(p.heading)}</b></div>` : ''}
      ${original ? `<div class="small muted" data-excerpt-language>${esc(t('chat_excerpt_original').replace('{lang}', t('lang_name_' + p.language) !== 'lang_name_' + p.language ? t('lang_name_' + p.language) : p.language))}</div>` : ''}
      <blockquote class="quote" data-quote>${esc(p.text)}</blockquote>
      <div data-warnings>${qualificationsHtml(p.review_status, p.warnings || [], ctx)}</div>
      ${quals ? `<div class="small" data-qualifications><b>${esc(t('chat_qualifications'))}</b><ul>${quals}</ul></div>` : ''}
      ${p.also_in && p.also_in.length ? `<div class="small muted" data-also-in>${esc(t('chat_also_in').replace('{n}', p.also_in.length))}</div>` : ''}
    </details>`;
  }

  // The server sends English text for the model and codes for the panel; older replies have text only.
  const tr = (ctx, key, fallback) => { const v = ctx.t(key); return v && v !== key ? v : fallback; };
  const STATUS_KEYS = { current: 'chat_status_current', 'none saved': 'chat_status_none_saved', 'none for this assessment': 'chat_status_none_here' };
  function status(s, ctx) {
    if (!s) return '–';
    if (s.status !== 'outdated') return ctx.esc(STATUS_KEYS[s.status] ? tr(ctx, STATUS_KEYS[s.status], s.status) : s.status);
    const reasons = s.codes ? [...s.codes.map(c => tr(ctx, 'stale_' + c, c)), ...(s.figure_issues ? [ctx.t('chat_figure_issues').replace('{n}', s.figure_issues)] : [])] : (s.reasons || []);
    return `<span class="badge-outdated">${ctx.esc(ctx.t('chat_status_outdated'))}</span> ${ctx.esc(reasons.join(' '))}`;
  }
  const problemText = (p, ctx) => tr(ctx, 'chat_problem_' + p.code, p.code).replace('{n}', p.n ?? '').replace('{id}', p.id ?? '');
  const focusProblemText = (f, ctx) => f.problem_code ? tr(ctx, 'chat_focus_' + f.problem_code, f.problem) : f.problem;
  /** Focus label in the interface language; ECAM input labels and user titles stay as written. */
  function focusLabel(f, ctx) {
    if (!f) return '';
    const L = o => (o && typeof o === 'object') ? (o[ctx.lang] || o.en) : (o ?? '');
    const stage = p => (ctx.stageLabel ? ctx.stageLabel(p) : p);
    if (f.sid && f.prefix && f.name) return `${stage(f.prefix)} › ${f.name}`;
    if (f.code && ctx.inputLabel) return ctx.inputLabel(f.code);
    if (f.prefix && !f.code && !f.key) return stage(f.prefix);
    if (f.action_id) return `${f.action_id} ${L(f.title)}`;
    if (f.label_code === 'section') return ctx.t('chat_focus_label_section').replace('{t}', f.section_title || '');
    if (f.label_code === 'stage') return ctx.t('chat_focus_label_stage').replace('{n}', f.stage);
    if (f.label_code) return tr(ctx, 'chat_focus_label_' + f.label_code, f.label);
    return f.label || f.kind || '';
  }

  /** Structured context: the project facts the assistant was given for this question. */
  const PROFILE_LABELS = { name: 'p_name', location: 'p_location', service_type: 'p_type', served: 'p_served', connections: 'p_conn' };
  function contextPanel(c, ctx, open) {
    const { t, esc, fmt } = ctx;
    if (!c) return '';
    const a = c.assessment, r = c.results;
    const missing = (c.missing || []).map(m => {
      if (m.kind === 'rule_check') return `<li>${esc(m.substage)}: ${esc(t('check_' + m.check))} — ${esc((m.missing_codes && ctx.inputLabel ? m.missing_codes.map(ctx.inputLabel) : m.missing_inputs || []).join(', ') || t('rs_' + m.reason))}</li>`;
      if (m.kind === 'unconfirmed_inputs') return `<li>${esc(m.substage)}: ${esc(t('chat_unconfirmed'))} ${esc((m.input_details && ctx.inputLabel ? m.input_details.map(i => `${ctx.inputLabel(i.code)} = ${fmt(i.value)} (${t('in_' + i.origin)})`) : m.inputs).join(', '))}</li>`;
      if (m.kind === 'utility_profile') return `<li>${esc(t('chat_profile_missing'))}: ${esc(m.fields.map(k => t(PROFILE_LABELS[k] || k)).join(', '))}</li>`;
      if (m.kind === 'not_computed') return `<li>${esc(t('chat_not_computed'))}: ${esc((m.codes ? m.codes.map((k, i) => tr(ctx, 'chat_nc_' + k, m.items[i])) : m.items).join('; '))}</li>`;
      return '';
    }).join('');
    const fw = c.framework || {};
    const enMark = x => x.original_language || x.questions_language ? ` <span class="muted" data-original-en>(${esc(t('original_english'))})</span>` : '';
    const fwRows = [...(fw.stage2 || []).map(x => `<li><b>${esc(x.title)}</b>${enMark(x)}<ul>${x.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul></li>`),
      ...(fw.stage3 || []).map(x => `<li><b>${esc(x.area)}. ${esc(x.title)}</b> — ${esc(x.description)}${x.questions.length ? `${enMark(x)}<ul>${x.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}</li>`),
      ...(fw.stage4 ? [`<li><b>${esc(t('chat_fw_costs'))}</b>: ${esc(fw.stage4.cost_components.join('; '))}</li><li><b>${esc(t('chat_fw_outputs'))}</b>: ${esc(fw.stage4.outputs.join('; '))}</li>`] : [])].join('');
    const fwEnglish = ctx.lang && ctx.lang !== 'en' && (fw.stage2 || []).some(x => x.original_language);
    const tierText = k => t('tier_' + k);
    const top = r && Array.isArray(r.largest_contributor) ? r.largest_contributor[0] : null;
    const stage = p => (ctx.stageLabel ? ctx.stageLabel(p) : p);
    const largest = top ? `${esc(top.substage)} (${esc(stage(top.prefix))}) · ${esc(fmt(top.tco2eq))} tCO₂eq (${esc(fmt(top.share_pct, 1))} %) · ${esc(t('chat_resp'))}: <span data-largest-resp="${esc(top.responsibility || '')}">${esc(tierText(top.responsibility || 'unspecified'))}</span>` : '';
    const rs = c.responsibility;
    const roleText = v => (['operates', 'shared', 'none'].includes(v) ? t('role_' + v) : t('role_unset'));
    const resp = rs ? `<ul>${Object.entries(rs.areas).map(([a, v]) => `<li>${esc(t('area_' + a))}: ${esc(roleText(v))}</li>`).join('')}</ul><div class="muted">${esc(t('chat_resp_source'))}</div>` : '';
    const rej = (c.actions && c.actions.rejected) || [];
    const rejected = rej.map(x => `<li data-ctx-rejected="${esc(x.key)}">${esc(x.label || '')} ${esc(x.title || '')}${x.reason ? ` — <i>${esc(x.reason)}</i>` : ''}${x.in_saved_selection ? ` <span class="dc-flag-inline">${esc(t('rejected_in_saved'))}</span>` : ''}</li>`).join('');
    const est = (c.inputs && c.inputs.ecam_estimates) || [];
    const estimates = est.map(x => `<li data-ctx-estimate="${esc(x.code)}">${esc(x.substage)}: ${esc(ctx.inputLabel ? ctx.inputLabel(x.code) : x.input)} = ${esc(fmt(x.value, 3))}</li>`).join('');
    const cp = c.concept;
    const concept = cp ? `<ul>${cp.areas.map(x => `<li data-ctx-concept="${esc(x.area)}">${esc(x.area)}. ${esc(x.title)} — ${esc(tr(ctx, 'pc_status_' + x.status, x.status))}${x.reviewed ? ` · ${esc(t('pc_reviewed'))}` : ''}${x.may_be_incomplete ? ` · ${esc(t('may_be_incomplete'))}` : ''}</li>`).join('')}</ul>${cp.ai_failed ? `<div class="dc-flag-inline">${esc(t('pc_ai_failed'))}</div>` : ''}<div class="muted">${esc(t('chat_concept_kind'))}</div>` : '';
    const paths = (c.pathways || []).map(p => `<li data-ctx-pathway="${esc(p.id)}"><b>${esc(p.name)}</b> — ${esc(t('chat_pathway_status'))}${p.documents.length ? `<ul>${p.documents.map(d => `<li data-ctx-doc="${esc(d.id)}">${esc(d.title)}${qualificationsHtml(d.review_status, d.caveats || [], ctx, 'data-doc-notes')}</li>`).join('')}</ul>` : ''}</li>`).join('');
    return `<details class="ctx-panel" data-context ${open ? 'open' : ''}><summary>${esc(t('chat_context'))}</summary>
      <dl class="dc-dl small">
        <dt>${esc(t('chat_scope'))}</dt><dd data-ctx-assessment="${esc(a ? a.id : '')}">${a ? `${esc(a.name)} · ${esc(a.period ? (ctx.fmtDate ? ctx.fmtDate(a.period.start) + ' – ' + ctx.fmtDate(a.period.end) : a.period.start + ' – ' + a.period.end) : '')} · ${esc(gwpText(a.gwp_report, ctx.lang))}` : esc(t('chat_no_assessment'))}</dd>
        <dt>${esc(t('chat_focus'))}</dt><dd data-ctx-focus>${esc(focusLabel(c.focus, ctx))}${c.focus.ok === false ? ` — <span class="dc-flag-inline">${esc(focusProblemText(c.focus, ctx))}</span>` : ''}</dd>
        ${r?.availability === 'not_assessed' ? `<dt>${esc(t('chat_results'))}</dt><dd>Not assessed / Belum dinilai</dd>` : r ? `<dt>${esc(t('chat_results'))}</dt><dd>${esc(fmt(r.total_tco2eq))} tCO₂eq · ${esc(fmt(r.energy_kwh))} kWh${largest ? `<br><span data-ctx-largest>${esc(t('chat_largest'))}: ${largest}</span>` : ''}</dd>` : ''}
        ${resp ? `<dt>${esc(t('chat_resp_title'))}</dt><dd data-ctx-responsibility>${resp}</dd>` : ''}
        ${rejected ? `<dt>${esc(t('chat_rejected_title'))}</dt><dd><ul>${rejected}</ul></dd>` : ''}
        ${estimates ? `<dt>${esc(t('chat_estimates_title'))}</dt><dd data-ctx-estimates><ul>${estimates}</ul><div class="muted">${esc(t('chat_estimates_note'))}</div></dd>` : ''}
        ${concept ? `<dt>${esc(t('chat_concept_title'))}</dt><dd>${concept}</dd>` : ''}
        ${paths ? `<dt>${esc(t('chat_pathways_title'))}</dt><dd data-ctx-pathways><ul>${paths}</ul></dd>` : ''}
        ${c.freshness && c.freshness.actions ? `<dt>${esc(t('chat_freshness'))}</dt><dd data-ctx-freshness>${esc(t('chat_fresh_actions'))}: ${status(c.freshness.actions, ctx)}<br>${esc(t('chat_fresh_plan'))}: ${status(c.freshness.plan, ctx)}<br>${esc(t('chat_fresh_proposal'))}: ${status(c.freshness.proposal, ctx)}</dd>` : ''}
        ${(c.problems || []).length ? `<dt>${esc(t('chat_problems'))}</dt><dd data-ctx-problems>${(c.problem_codes && c.problem_codes.length === c.problems.length ? c.problem_codes.map(p => problemText(p, ctx)) : c.problems).map(esc).join('<br>')}</dd>` : ''}
        ${missing ? `<dt>${esc(t('chat_missing'))}</dt><dd><ul>${missing}</ul></dd>` : ''}
        ${fwRows ? `<dt>${esc(t('chat_framework'))}</dt><dd data-ctx-framework>${fwEnglish ? `<div class="small muted" data-original-language>${esc(t('chat_fw_original_language'))}</div>` : ''}<div class="muted">${esc(fw.review_status || '')}</div><ul>${fwRows}</ul></dd>` : ''}
      </dl></details>`;
  }

  /** One assistant message from a /api/chat response. */
  function assistant(m, ctx) {
    const ret = m.retrieval || { status: 'none', passages: [] };
    const titles = new Map([...(ret.passages || []), ...(m.sources || [])].map(p => [p.id, p.title]));
    ctx = { ...ctx, titleOf: id => titles.get(id) || null };
    const { t, esc } = ctx;
    const other = m.context && m.context.mentions_other && m.context.mentions_other.length
      ? `<div class="notice small warn" data-other-assessment>${esc(t('chat_other_assessment').replace('{names}', m.context.mentions_other.join(', ')).replace('{current}', (m.context.assessment && m.context.assessment.name) || '–'))}</div>` : '';
    const focusProblem = m.context && m.context.focus && m.context.focus.ok === false
      ? `<div class="notice small warn" data-focus-problem>${esc(t('chat_focus_problem').replace('{p}', focusProblemText(m.context.focus, ctx)))}</div>` : '';
    const dropped = m.scope && m.scope.history_dropped ? `<div class="small muted" data-history-dropped>${esc(t('chat_history_dropped').replace('{n}', m.scope.history_dropped))}</div>` : '';
    const hint = m.context && m.context.assessment ? ` ${esc(t('chat_project_data_hint'))}` : '';
    const noPassage = ret.status === 'unavailable'
      ? `<div class="small" data-library-unavailable><b>${esc(t('chat_library_unavailable'))}</b>${hint}</div>`
      : `<div class="small" data-no-passage><b>${esc(t('chat_no_passage'))}</b>${hint}</div>`;
    const searched = ret.query ? `<div class="small muted" data-searched="${esc(ret.query_from || '')}">${esc(t('chat_searched'))}: ${esc(ret.query.slice(0, 160))}</div>` : '';
    if (m.error) return `<div class="msg bot" data-chat-error>${esc(m.content)}</div>`;
    if (m.ai === false) {
      return `<div class="msg bot" data-ai="off"><div class="notice small" data-ai-off-label>${esc(t('chat_ai_off_head'))}</div>${other}${focusProblem}
        ${ret.status === 'found' ? `<div class="small"><b>${esc(t('chat_excerpts'))}</b></div><ul class="src-list small">${ret.passages.map(p => sourceLine(p, ctx)).join('')}</ul>` : noPassage}
        ${contextPanel(m.context, ctx, false)}</div>`;
    }
    const support = (m.support || []).map(s => s.status === 'unknown_source' ? '' :
      `<li data-support="${esc(s.status)}">[${esc(s.id)}] ${esc(t(s.status === 'low_overlap' ? 'chat_support_low' : 'chat_support_overlap').replace('{p}', Math.round(100 * s.overlap)))}</li>`).join('');
    return `<div class="msg bot" data-ai="on"><div class="small muted" data-ai-label>${esc(t('chat_ai_answer_label'))}</div>${other}${focusProblem}${dropped}
      <div class="reply">${esc(m.content)}</div>
      ${(m.sources || []).length ? `<div class="small src-head"><b>${esc(t('chat_cited'))}</b></div><ul class="src-list small">${m.sources.map(p => sourceLine(p, ctx, p.tag)).join('')}</ul>` : ''}
      ${ret.status === 'unavailable' ? noPassage : ''}
      ${contextPanel(m.context, ctx, false)}</div>`;
  }

  /** Header line: which assessment and item the chat is about. */
  function scope({ name, focusLabel, ai }, ctx) {
    const { t, esc } = ctx;
    return `<div class="chat-scope-line"><span class="muted">${esc(t('chat_scope'))}:</span> <b data-scope-assessment>${esc(name || t('chat_no_assessment'))}</b></div>
      ${focusLabel ? `<div class="chat-scope-line"><span class="muted">${esc(t('chat_focus'))}:</span> <span data-scope-focus>${esc(focusLabel)}</span> <button type="button" class="link small" data-chat-unfocus>${esc(t('chat_focus_clear'))}</button></div>` : ''}
      <div class="small muted" data-readonly>${esc(t('chat_readonly'))}${ai ? '' : ' ' + esc(t('chat_ai_off_short'))}</div>`;
  }

  return { excerpt, sourceLine, pageUrl, contextPanel, assistant, scope, focusLabel, qualificationsHtml, noteHtml };
});
