/*
 * HTML for the features added after the October 20 team meeting (no state; global FU in the browser).
 *   responsibilityPanel  Stage 1 results: total inventory vs emissions the utility can act on
 *   tierChip / flagsLine Stage 2 cards: responsibility tier and feasibility flags from the profile
 *   alternatives         Stage 2: alternative or revised actions offered as drafts the user can add
 *   estimatesSummary     Stage 1 results: inputs that use ECAM estimates instead of utility data
 *   reviewChecklist      Stage 3/4: placeholders, unreviewed AI text and uncited claims before sharing
 *   pathways             Stage 4: financing pathways matched to the project (shortlist, not eligibility)
 *
 * ctx: { t, L, esc, fmt, stageLabel }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./responsibility'));
  else root.FU = factory(root.RS);
})(typeof self !== 'undefined' ? self : this, function (RS) {
  const TIER_ICON = { direct: '●', conditional: '◐', outside: '○', unspecified: '?', rejected: '×' };

  function tierChip(tier, ctx, extraTitle) {
    const { t, esc } = ctx;
    const k = tier || 'unspecified';
    return `<span class="tier tier-${k}" data-tier="${k}" title="${esc(t('tier_desc_' + k) + (extraTitle ? ' · ' + extraTitle : ''))}">${TIER_ICON[k] || ''} ${esc(t('tier_' + k))}</span>`;
  }
  /** "Directly actionable · Water supply …" plus feasibility flags, for one option. */
  function cardLine(o, profile, ctx) {
    const { t, esc } = ctx;
    const r = RS.forOption(o, profile);
    if (!r) return '';
    const area = r.area ? t('area_' + r.area) : '';
    const flags = RS.flags(o, profile);
    return `<p class="small dc-line" data-responsibility="${r.tier}">${tierChip(r.tier, ctx, t('rb_' + r.basis))}${area ? ` <span class="muted">${esc(area)}</span>` : ''}
      ${flags.map(f => `<span class="flag" data-flag="${f}" title="${esc(t('flags_from_profile'))}">${esc(t('fl_' + f))}</span>`).join(' ')}</p>`;
  }

  /** rows: [{ prefix, sid, name, component, kg }] (same rows as the largest-contributor panel). */
  function responsibilityPanel(rows, profile, ctx, opts = {}) {
    const { t, esc, fmt } = ctx;
    if (!RS.answered(profile)) {
      return `<div class="card ra" data-ra="unset"><h2>${esc(t('ra_title'))}</h2><p class="muted">${esc(t('ra_set_profile'))}</p>
        <button class="btn sm" data-act="edit-profile">${esc(t('edit_profile'))}</button></div>`;
    }
    const b = RS.breakdown(rows, profile);
    if (!(b.total > 0)) return '';
    const tiers = ['direct', 'conditional', 'outside', 'unspecified'].filter(k => k !== 'unspecified' || b.byTier.unspecified > 0);
    const pct = v => (100 * v / b.total);
    const bar = tiers.map(k => b.byTier[k] > 0 ? `<i class="ra-seg tier-bg-${k}" style="width:${pct(b.byTier[k]).toFixed(2)}%" title="${esc(t('tier_' + k))}"></i>` : '').join('');
    const tiles = [`<div class="kpi" data-ra-total><div class="v">${fmt(b.total / 1000)}</div><div class="l">${esc(t('ra_total'))} (tCO₂eq)</div></div>`,
      ...tiers.map(k => `<div class="kpi ra-k" data-ra-tier="${k}"><div class="v">${fmt(b.byTier[k] / 1000)} <span class="small muted">${fmt(pct(b.byTier[k]), 0)}%</span></div><div class="l">${tierChip(k, ctx)}</div></div>`)].join('');
    const where = r => `${esc(ctx.stageLabel(r.prefix))} › ${esc(r.name || '')}`;
    const topRow = (label, r) => r ? `<li data-ra-top><b>${esc(label)}:</b> ${esc(ctx.componentText(r.prefix, r.component))} · ${where(r)} · ${fmt(r.kg / 1000, 0)} tCO₂eq (${fmt(pct(r.kg), 1)}%) ${tierChip(r.tier, ctx)}</li>` : '';
    const sameTop = b.top.overall && b.top.actionable && b.top.overall.sid === b.top.actionable.sid && b.top.overall.component === b.top.actionable.component;
    const outsideShare = pct(b.byTier.outside);
    return `<div class="card ra" data-ra="ok"><div class="row"><h2 class="grow" style="margin:0">${esc(t('ra_title'))}</h2>
        ${opts.editable === false ? '' : `<button class="btn sm" data-act="edit-profile">${esc(t('edit_profile'))}</button>`}</div>
      <div class="kpis ra-tiles">${tiles}</div>
      <div class="ra-bar" aria-hidden="true">${bar}</div>
      <ul class="ra-top">${topRow(t('ra_top_overall'), b.top.overall)}${sameTop ? '' : b.top.actionable ? topRow(t('ra_top_actionable'), b.top.actionable) : `<li class="muted">${esc(t('ra_none_actionable'))}</li>`}</ul>
      ${outsideShare >= 1 ? `<p class="small" data-ra-outside>${esc(t('ra_outside_note').replace('{p}', fmt(outsideShare, 0)))}</p>` : ''}
      <p class="small muted" style="margin:0">${esc(t('ra_note'))}</p></div>`;
  }

  /** list: [{ sid, prefix, substage, code, label, value, unit }] */
  function estimatesSummary(list, ctx) {
    const { t, esc } = ctx;
    if (!list.length) return '';
    return `<details class="card est-summary" data-estimates="${list.length}"><summary><b>${esc(t('est_count').replace('{n}', list.length))}</b> <span class="est-badge">${esc(t('est_badge'))}</span></summary>
      <p class="small muted">${esc(t('est_summary_note'))}</p>
      <ul class="small">${list.map(e => `<li data-estimate="${esc(e.code)}">${esc(ctx.stageLabel(e.prefix))} › ${esc(e.substage)}: ${e.label} = <b>${esc(e.value)}</b> ${esc(e.unit || '')}</li>`).join('')}</ul></details>`;
  }

  // numbers with a unit or currency: drafts should not carry them (ECAM is the only source of figures)
  const hasFigures = s => /\d[\d.,]*\s*(%|kwh|mwh|gwh|tco2|kgco2|tonnes?|ton\b|juta|miliar|million|billion|idr|usd|m3|m³|l\/s)|(rp\.?|idr|usd|\$)\s?\d/i.test(String(s || ''));
  /**
   * res: { source: 'framework' | 'ai', mode: 'alternatives' | 'revise', items: [{ title, description, problem, why, open }], basedOn }
   */
  function alternatives(res, key, ctx) {
    const { t, esc } = ctx;
    if (!res) return '';
    const head = res.mode === 'revise' ? t('revise_title') : t('alt_title');
    const items = (res.items || []).map((a, i) => `<li class="alt" data-alt-item="${i}">
        <b>${esc(a.title)}</b>${a.description ? `<div class="small">${esc(a.description)}</div>` : ''}
        ${a.why ? `<div class="small"><span class="muted">${esc(t('alt_why'))}:</span> ${esc(a.why)}</div>` : ''}
        ${a.open ? `<div class="small"><span class="muted">${esc(t('alt_open'))}:</span> ${esc(a.open)}</div>` : ''}
        ${hasFigures([a.title, a.description, a.why].join(' ')) ? `<div class="small dc-flag" data-alt-figures>${esc(t('alt_figures_warning'))}</div>` : ''}
        <button class="btn sm" data-alt-add="${esc(key)}|${i}">${esc(t('alt_add'))}</button></li>`).join('');
    return `<div class="alt-box" data-alternatives="${esc(res.source)}">
      <div class="row"><b class="grow">${esc(head)}</b><button class="link small" data-alt-close="${esc(key)}">${esc(t('alt_close'))}</button></div>
      <p class="small muted" style="margin:2px 0 6px">${esc(t(res.source === 'ai' ? 'alt_from_ai' : 'alt_from_framework'))}</p>
      ${res.questions && res.questions.length ? `<details class="small" style="margin-bottom:6px"><summary>${esc(t('alt_open'))}</summary><ul>${res.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul></details>` : ''}
      ${items ? `<ol class="alts">${items}</ol>` : `<p class="small">${esc(t('alt_none'))}</p>`}</div>`;
  }

  // ------------------------------------------------------------ review checklist (plan concept, proposal)
  const PLACEHOLDER = /\[(?:To be provided|To be completed|Perlu dilengkapi|Perlu disediakan)[^\]]*\]/gi;
  // sentences that state regulations, funders, eligibility or costs need a [S#] source when AI wrote them
  const CLAIM = /\b(regulation|peraturan|permen|perpres|undang|law|eligib|kelayakan|green climate fund|gcf|world bank|bank dunia|adb|dak|apbd|kpbu|ppp|grant|hibah|loan|pinjaman|cost|biaya|rp\.?\s?\d|idr|usd)\b/i;
  const PH_TEST = new RegExp(PLACEHOLDER.source, 'i');
  const sentences = text => String(text || '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  /**
   * parts: [{ where, text, ai, reviewed }]. Returns { placeholders, unreviewed, uncited, items } (counts and where).
   */
  function review(parts) {
    const out = { placeholders: 0, unreviewed: 0, uncited: 0, items: [] };
    for (const p of parts || []) {
      const ph = (String(p.text || '').match(PLACEHOLDER) || []).length;
      const unc = p.ai ? sentences(p.text).filter(s => CLAIM.test(s) && !/\[S\d+/.test(s) && !PH_TEST.test(s)).length : 0;
      const unrev = p.ai && !p.reviewed ? 1 : 0;
      out.placeholders += ph; out.uncited += unc; out.unreviewed += unrev;
      if (ph || unc || unrev) out.items.push({ where: p.where, placeholders: ph, uncited: unc, unreviewed: !!unrev });
    }
    return out;
  }
  function reviewChecklist(parts, ctx) {
    const { t, esc } = ctx;
    const r = review(parts);
    const lines = [r.placeholders ? t('rv_placeholders').replace('{n}', r.placeholders) : null,
      r.unreviewed ? t('rv_unreviewed').replace('{n}', r.unreviewed) : null,
      r.uncited ? t('rv_uncited').replace('{n}', r.uncited) : null].filter(Boolean);
    if (!lines.length) return `<div class="notice small" data-review-ok>${esc(t('rv_title'))}: ${esc(t('rv_ok'))}</div>`;
    return `<div class="notice warn small" data-review="${r.placeholders}|${r.unreviewed}|${r.uncited}"><b>${esc(t('rv_title'))}</b>
      <ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="muted">${esc(t('rv_where'))}: ${r.items.map(i => esc(i.where)).join(' · ')}</div></div>`;
  }

  // ------------------------------------------------------------ financing pathways
  /** match: engine/pathways.js result { matched: [...], other: [...] }; selected: Set of ids */
  function pathways(match, selected, ctx) {
    const { t, L, esc } = ctx;
    const one = p => `<li class="fp" data-pathway="${esc(p.id)}"><label class="row" style="gap:8px;flex-wrap:nowrap;align-items:flex-start">
        <input type="checkbox" data-fp="${esc(p.id)}" ${selected.has(p.id) ? 'checked' : ''} aria-label="${esc(t('fp_consider'))}">
        <span><b>${esc(L(p.name))}</b><div class="small muted">${esc(L(p.summary))}</div></span></label>
      <details><summary class="small">${esc(t('fp_why'))}: ${p.reasons.map(r => esc(r)).join('; ') || '–'}</summary>
        <dl class="dc-dl small"><dt>${esc(t('fp_who'))}</dt><dd>${esc(L(p.who))}</dd>
          <dt>${esc(t('fp_questions'))}</dt><dd><ul>${(p.questions || []).map(q => `<li>${esc(L(q))}</li>`).join('')}</ul></dd>
          ${p.documents.length ? `<dt>${esc(t('fp_docs'))}</dt><dd><ul>${p.documents.map(d => `<li>${esc(d.title)}${d.caveat ? ` <span class="muted">(${esc(d.caveat)})</span>` : ''}</li>`).join('')}</ul></dd>` : ''}</dl></details></li>`;
    return `<div class="card" data-pathways><h2>${esc(t('fp_title'))}</h2><p class="small muted">${esc(t('fp_sub'))}</p>
      <ul class="fps">${match.matched.map(one).join('')}</ul>
      ${match.other.length ? `<details><summary class="small">${esc(t('fp_other'))}</summary><ul class="fps">${match.other.map(one).join('')}</ul></details>` : ''}
      <p class="small muted" style="margin:8px 0 0">${esc(t('fp_status'))}</p>
      ${selected.size ? '' : `<p class="small" data-fp-none>${esc(t('fp_none_selected'))}</p>`}</div>`;
  }

  return { tierChip, cardLine, responsibilityPanel, estimatesSummary, alternatives, hasFigures, review, reviewChecklist, pathways, PLACEHOLDER };
});
