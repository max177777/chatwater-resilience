/*
 * Stage 3 — turn selected actions into a task plan using frameworks/project-plan.json.
 */
const FRAMEWORK = require('../frameworks/project-plan.json');

function buildPlan(actions, lang = 'en') {
  const L = o => (o && (o[lang] || o.en)) || '';
  const tasks = [];
  let n = 1;
  for (const a of actions.filter(a => a.rule !== 'baseline')) {
    let start = 0, prev = null;
    // a verification-only option stops after confirmation + monitoring set-up
    const phases = a.rule === 'pump_audit'
      ? FRAMEWORK.phases.filter(p => p.key === 'confirm')
      : FRAMEWORK.phases;
    for (const p of phases) {
      const weeks = FRAMEWORK.category_weeks[a.category]?.[p.key] ?? p.weeks;
      const id = 'T' + String(n++).padStart(2, '0');
      tasks.push({
        id, action_id: a.id, action_key: a.key || null, action: L(a.title), phase: p.key,
        name: `${L(p)}${p.key === 'confirm' && a.condition ? ': ' + L(a.condition) : ''}`,
        owner: L(p.owner), start_week: start, weeks, depends_on: prev ? [prev] : [],
      });
      start += weeks; prev = id;
    }
  }
  const total_weeks = tasks.reduce((m, t) => Math.max(m, t.start_week + t.weeks), 0);
  return { tasks, total_weeks };
}

module.exports = { buildPlan, FRAMEWORK };
