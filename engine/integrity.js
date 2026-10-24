/*
 * Server-side checks that actions, plan, proposal and exports belong to the
 * same assessment revision. The browser runs the same freshness rules
 * (public/js/cw-core.js); the server re-derives everything from the data it
 * receives and recomputes the actions with ECAM, so it does not rely on the
 * browser's own bookkeeping.
 */
const CW = require('../public/js/cw-core');
const CA = require('../public/js/custom-actions');
const engine = require('./ecam-engine');
const V = require('./assessment-validity');
const { suggestActions } = require('./actions');

const MESSAGES = {
  input_status_changed: 'input support or confirmation changed',
  input_status_untracked: 'input support was not tracked when this was created; review it again',
  legacy: 'it was created before version tracking and needs review',
  assessment_missing: 'its assessment is no longer in the project',
  assessment_changed: 'the assessment data changed',
  gwp_changed: 'the GWP report changed',
  actions_changed: 'the selected actions changed',
  actions_outdated: 'the selected actions are outdated',
  profile_changed: 'the utility profile changed',
  plan_changed: 'the project plan changed',
  plan_outdated: 'the project plan is outdated',
  custom_changed: 'a selected user-proposed action was edited after the selection was saved',
  custom_deleted: 'a selected user-proposed action was deleted',
  action_rejected: 'a selected action was marked not relevant after the selection was saved',
  framework_changed: 'the financing route or framework changed',
};
const WHAT = { actions: 'Selected actions', plan: 'Project plan', proposal: 'Proposal' };
const describe = (stage, codes) => `${WHAT[stage]}: ${codes.map(c => MESSAGES[c] || c).join('; ')}.`;

function conflict(message, issues) {
  const e = new Error(message);
  e.status = 409; e.issues = issues;
  return e;
}

const CUSTOM_MESSAGES = {
  not_object: 'not an action', origin: 'not marked as user-proposed', cid: 'missing or malformed ID',
  assessment: 'it belongs to a different assessment', key: 'its identity does not match its assessment', label: 'missing label',
  title_required: 'title is required', description_required: 'description is required',
  title_too_long: 'title is too long', description_too_long: 'description is too long', problem_too_long: 'problem text is too long', notes_too_long: 'notes are too long',
  figures: 'user-proposed actions cannot carry benefit figures', category: 'unexpected category',
  location_invalid: 'location is malformed', location_missing: 'its substage no longer exists; choose a new location in stage 2',
};
const customMessage = c => CUSTOM_MESSAGES[c] || (c.startsWith('unknown_field:') ? `unexpected field "${c.slice(14)}"` : c.startsWith('type:') ? `${c.slice(5)} must be text` : c);

const titleOf = a => (a.title && typeof a.title === 'object') ? a.title.en : a.title;
const same = (a, b) => a == null && b == null ? true
  : (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)));

function optionsFor(assessment, meta, gwpIndex = 0, inputStatus) {
  const results = inputStatus === undefined ? engine.calculateOne(assessment,gwpIndex) : V.calculate(assessment,gwpIndex,{meta,inputStatus});
  return CW.withKeys(suggestActions(results, assessment, engine, gwpIndex,inputStatus).options, meta);
}

/** Problems with the selected actions for this assessment (empty when they match a fresh ECAM run). */
function actionIssues({ assessment, meta, gwpIndex = 0, actions = [], actionSet, inputStatus, rejected = null }) {
  if (actions != null && !Array.isArray(actions)) return ['Selected actions are malformed.'];
  const sel = (actions || []).filter(a => !(a && a.rule === 'baseline'));
  if (!sel.length) return [];
  if (sel.some(a => !a || typeof a !== 'object' || Array.isArray(a))) return ['Selected actions contain an entry that is not an action.'];
  if (!actionSet || actionSet.legacy || !actionSet.revision) return [describe('actions', ['legacy'])];
  if (!assessment || !meta || !meta.id) return [describe('actions', ['assessment_missing'])];
  const codes = [];
  if (actionSet.assessmentId !== meta.id) return ['Selected actions belong to a different assessment than the one sent.'];
  if (actionSet.revision !== CW.revision(assessment)) codes.push('assessment_changed');
  if ((actionSet.gwpIndex || 0) !== (gwpIndex || 0)) codes.push('gwp_changed');
  const reviewed=V.calculate(assessment,gwpIndex,{meta,inputStatus});
  if (actionSet.supportRevision !== undefined && actionSet.supportRevision !== reviewed.supportRevision) codes.push('input_status_changed');
  if (codes.length) return [describe('actions', codes)];
  const dropped = CW.rejectedInSelection(sel, rejected);
  if (dropped.length) return [describe('actions', ['action_rejected']) + ' ' + dropped.map(a => `"${titleOf(a)}"`).join(', ') + '.'];
  // user-proposed actions: structure and source assessment only; they carry no figures to recalculate
  const issues = [];
  const custom = sel.filter(CW.isCustom), calculated = sel.filter(a => !CW.isCustom(a));
  if (new Set(custom.map(a => a && a.key)).size !== custom.length) issues.push('A user-proposed action is selected more than once.');
  for (const a of custom) {
    const problems = CA.validate(a, meta);
    if (problems.length) issues.push(`User-proposed action "${typeof a?.title === 'string' ? a.title.slice(0, 80) : '?'}" is not valid: ${problems.map(customMessage).join('; ')}.`);
  }
  if (!calculated.length) return issues;
  const fresh = new Map(optionsFor(assessment, meta, gwpIndex, inputStatus === undefined ? null : inputStatus).map(o => [o.key, o]));
  for (const a of calculated) {
    const o = fresh.get(a.key);
    if (!o) issues.push(`Action "${titleOf(a)}" is not produced by this assessment.`);
    else if (o.rule === 'nrw_reduction' && titleOf(o) !== titleOf(a)) issues.push('Refresh the water-loss action: an earlier version called its measure NRW.');
    else if (o.provisional_warning && (!a.provisional_warning || a.condition?.en !== o.condition.en)) issues.push('Refresh the pump action to retain its provisional calculation-boundary warning.');
    else if (!same(o.expected_kgco2, a.expected_kgco2) || !same(o.expected_kwh, a.expected_kwh)) issues.push(`The figures for "${titleOf(a)}" do not match the assessment.`);
  }
  return issues;
}

/** Throw 409 when the actions sent with a drafting request are not current. */
function requireCurrentActions(input) {
  const issues = actionIssues(input);
  if (issues.length) throw conflict('Update the selected actions in stage 2 first. ' + issues.join(' '), issues);
}

/** Throw 409 when the plan sent with a proposal request is outdated. */
function requireCurrentPlan({ assessment, meta, gwpIndex, actions, actionSet, plan, profile, inputStatus, rejected }) {
  if (!plan) return;
  const f = CW.freshness({
    assessments: meta?.id ? [{ id: meta.id, revision: CW.revision(assessment),supportRevision:V.calculate(assessment,gwpIndex,{meta,inputStatus}).supportRevision }] : [],
    gwpIndex, actionSet, selectedActions: actions, plan, profile, rejected,
  });
  if (f.plan.length) throw conflict('Regenerate or review the project plan first. ' + describe('plan', f.plan), [describe('plan', f.plan)]);
  if (CW.summedClaims({ plan }).plan) throw conflict(SUMMED.plan, [SUMMED.plan]);
}

const SUMMED = {
  plan: 'Project plan: the summary adds the actions\' reductions together (sentence from an earlier version). Combined savings have not been assessed because actions may overlap. Delete or rewrite that sentence, or regenerate the plan.',
  proposal: titles => `Proposal: ${titles.join(', ')} adds the actions' reductions together (sentence from an earlier version). Combined savings have not been assessed because actions may overlap. Delete or rewrite that sentence, or regenerate the proposal.`,
};
function summedIssues(body) {
  const s = CW.summedClaims({ plan: body.plan, proposal: body.proposal });
  return [s.plan ? SUMMED.plan : null, s.proposal.length ? SUMMED.proposal(s.proposal) : null].filter(Boolean);
}

/**
 * Validate an export request. Returns { assessment, meta } of the assessment the
 * downstream outputs were made from, or throws 409 listing every problem.
 */
function exportContext(body, { requireProposal = false } = {}) {
  const list = body.assessments || [], metas = body.assessmentMeta || [];
  const raw = body.selectedActions;
  if ((raw != null && !Array.isArray(raw)) || (raw || []).some(a => !a || typeof a !== 'object' || Array.isArray(a))
    || (body.customActions != null && (!Array.isArray(body.customActions) || body.customActions.some(c => !c || typeof c !== 'object')))) {
    throw conflict('Export blocked. The selected or user-proposed actions are malformed.', ['The selected or user-proposed actions are malformed.']);
  }
  const actions = (raw || []).filter(a => a.rule !== 'baseline');
  const issues = [];
  if (requireProposal && !body.proposal) issues.push('There is no draft proposal yet. Draft it in stage 4 first.');

  const ids = [body.actionSet?.assessmentId, body.plan?.deps?.assessmentId, body.proposal?.deps?.assessmentId].filter(Boolean);
  if (new Set(ids).size > 1) issues.push('The selected actions, plan and proposal come from different assessments.');
  const hasDownstream = actions.length || body.plan || body.proposal;
  const aid = ids[0] || null;
  const idx = aid ? metas.findIndex(m => m && m.id === aid) : -1;
  if (hasDownstream && idx < 0) issues.push(ids.length ? 'The assessment used for the actions, plan or proposal is no longer in the project.' : 'The actions, plan or proposal were created before version tracking. Review them in the app before exporting.');
  if (hasDownstream && metas.length !== list.length) issues.push('Assessment metadata is missing. Reload the app and try again.');

  const assessment = idx >= 0 ? list[idx] : null, meta = idx >= 0 ? metas[idx] : null;
  if (assessment && !issues.length) {
    const gwpIndex = body.gwpIndex || 0;
    issues.push(...actionIssues({ assessment, meta, gwpIndex, actions, actionSet: body.actionSet, inputStatus:body.inputStatus?.[meta?.id], rejected: body.rejectedActions }));
    const f = CW.freshness({
      assessments: [{ id:meta.id,revision:CW.revision(assessment),supportRevision:V.calculate(assessment,gwpIndex,{meta,inputStatus:body.inputStatus?.[meta.id]}).supportRevision }],
      gwpIndex, actionSet: body.actionSet, selectedActions: body.selectedActions,
      plan: body.plan, proposal: body.proposal, profile: body.profile, financing: body.financing, rejected: body.rejectedActions,
      customActions: Array.isArray(body.customActions) ? CW.customDefs(body.customActions, body.actionNotes) : undefined,
    });
    const customCodes = f.actions.filter(c => c.startsWith('custom_'));
    if (customCodes.length) issues.push(describe('actions', customCodes));
    for (const stage of ['plan', 'proposal']) if (f[stage].length) issues.push(describe(stage, f[stage]));
  }
  issues.push(...summedIssues(body));
  if (issues.length) throw conflict('Export blocked. ' + issues.join(' '), issues);
  return { assessment, meta };
}

module.exports = { actionIssues, requireCurrentActions, requireCurrentPlan, exportContext, summedIssues, optionsFor, describe, MESSAGES };
