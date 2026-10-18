/*
 * Server-side checks that actions, plan, proposal and exports belong to the
 * same assessment revision. The browser runs the same freshness rules
 * (public/js/cw-core.js); the server re-derives everything from the data it
 * receives and recomputes the actions with ECAM, so it does not rely on the
 * browser's own bookkeeping.
 */
const CW = require('../public/js/cw-core');
const engine = require('./ecam-engine');
const { suggestActions } = require('./actions');

const MESSAGES = {
  legacy: 'it was created before version tracking and needs review',
  assessment_missing: 'its assessment is no longer in the project',
  assessment_changed: 'the assessment data changed',
  gwp_changed: 'the GWP report changed',
  actions_changed: 'the selected actions changed',
  actions_outdated: 'the selected actions are outdated',
  profile_changed: 'the utility profile changed',
  plan_changed: 'the project plan changed',
  plan_outdated: 'the project plan is outdated',
  framework_changed: 'the financing route or framework changed',
};
const WHAT = { actions: 'Selected actions', plan: 'Project plan', proposal: 'Proposal' };
const describe = (stage, codes) => `${WHAT[stage]}: ${codes.map(c => MESSAGES[c] || c).join('; ')}.`;

function conflict(message, issues) {
  const e = new Error(message);
  e.status = 409; e.issues = issues;
  return e;
}

const titleOf = a => (a.title && typeof a.title === 'object') ? a.title.en : a.title;
const same = (a, b) => (a == null || a === 0) && (b == null || b === 0) ? true
  : (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)));

function optionsFor(assessment, meta, gwpIndex = 0) {
  const results = engine.calculateOne(assessment, gwpIndex);
  return CW.withKeys(suggestActions(results, assessment, engine, gwpIndex).options, meta);
}

/** Problems with the selected actions for this assessment (empty when they match a fresh ECAM run). */
function actionIssues({ assessment, meta, gwpIndex = 0, actions = [], actionSet }) {
  const sel = (actions || []).filter(a => a.rule !== 'baseline');
  if (!sel.length) return [];
  if (!actionSet || actionSet.legacy || !actionSet.revision) return [describe('actions', ['legacy'])];
  if (!assessment || !meta || !meta.id) return [describe('actions', ['assessment_missing'])];
  const codes = [];
  if (actionSet.assessmentId !== meta.id) return ['Selected actions belong to a different assessment than the one sent.'];
  if (actionSet.revision !== CW.revision(assessment)) codes.push('assessment_changed');
  if ((actionSet.gwpIndex || 0) !== (gwpIndex || 0)) codes.push('gwp_changed');
  if (codes.length) return [describe('actions', codes)];
  const fresh = new Map(optionsFor(assessment, meta, gwpIndex).map(o => [o.key, o]));
  const issues = [];
  for (const a of sel) {
    const o = fresh.get(a.key);
    if (!o) issues.push(`Action "${titleOf(a)}" is not produced by this assessment.`);
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
function requireCurrentPlan({ assessment, meta, gwpIndex, actions, actionSet, plan, profile }) {
  if (!plan) return;
  const f = CW.freshness({
    assessments: meta?.id ? [{ id: meta.id, revision: CW.revision(assessment) }] : [],
    gwpIndex, actionSet, selectedActions: actions, plan, profile,
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
  const actions = (body.selectedActions || []).filter(a => a.rule !== 'baseline');
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
    issues.push(...actionIssues({ assessment, meta, gwpIndex, actions, actionSet: body.actionSet }));
    const f = CW.freshness({
      assessments: metas.map((m, i) => ({ id: m && m.id, revision: CW.revision(list[i]) })),
      gwpIndex, actionSet: body.actionSet, selectedActions: body.selectedActions,
      plan: body.plan, proposal: body.proposal, profile: body.profile, financing: body.financing,
    });
    for (const stage of ['plan', 'proposal']) if (f[stage].length) issues.push(describe(stage, f[stage]));
  }
  issues.push(...summedIssues(body));
  if (issues.length) throw conflict('Export blocked. ' + issues.join(' '), issues);
  return { assessment, meta };
}

module.exports = { actionIssues, requireCurrentActions, requireCurrentPlan, exportContext, summedIssues, optionsFor, describe, MESSAGES };
