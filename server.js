/*
 * ChatWater Resilience — web server.
 *   npm start   → http://localhost:3000
 * Env: PORT, ANTHROPIC_API_KEY (optional, enables AI), CLAUDE_MODEL (optional)
 */
const path = require('path');
const express = require('express');
const engine = require('./engine/ecam-engine');
const { suggestActions } = require('./engine/actions');
const { buildPlan } = require('./engine/plan');
const knowledge = require('./engine/knowledge');
const { callClaude, aiEnabled, MODEL } = require('./engine/ai');
const P = require('./engine/proposal');
const X = require('./engine/export');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));

// static files: app, and the unmodified ECAM backend + English labels for the browser
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/ecam', express.static(path.join(__dirname, 'vendor', 'ecam'), { maxAge: '1d' }));

// --- tiny in-memory rate limit for AI routes (per IP, per minute)
const hits = new Map();
function limitAI(req, res, next) {
  const key = req.ip, now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < 60000);
  if (arr.length >= 20) return res.status(429).json({ error: 'Too many AI requests, wait a minute.' });
  arr.push(now); hits.set(key, arr); next();
}
const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => {
  console.error(e);
  res.status(e.code === 'NO_KEY' ? 503 : 400).json({ error: e.message });
});

// Results are always recomputed on the server from the ECAM inputs, so AI
// drafts only ever see numbers produced by ECAM's formulas.
const resultsFor = (assessment, gwpIndex) => assessment ? engine.calculateOne(assessment, gwpIndex || 0) : null;

app.get('/api/health', (req, res) => {
  const k = knowledge.summary();
  res.json({ ok: true, ai: aiEnabled(), model: aiEnabled() ? MODEL : null, ecam: '3.0.1', knowledge: { documents: k.documents, byTopic: k.byTopic } });
});

// What the RAG knowledge base contains (for the team to check their uploads were read)
app.get('/api/knowledge', (req, res) => res.json(knowledge.summary()));
app.get('/api/knowledge/search', (req, res) => res.json(knowledge.search(String(req.query.q || ''), {
  k: Math.min(+req.query.k || 6, 20), topics: req.query.topic ? String(req.query.topic).split(',') : null,
})));

app.get('/api/meta', (req, res) => res.json({
  countries: engine.countries(), gwpReports: engine.gwpReports(),
  financing: P.financingFrameworks().map(f => ({ id: f.id, name: f.name, note: f._note })),
}));

app.post('/api/calculate', wrap((req, res) => {
  const { assessments, gwpIndex } = req.body;
  res.json({ results: engine.calculate(assessments, { gwpIndex }) });
}));

app.post('/api/actions', wrap((req, res) => {
  const { assessment, gwpIndex } = req.body;
  const r = resultsFor(assessment, gwpIndex);
  res.json({ results: r, ...suggestActions(r, assessment, engine, gwpIndex || 0) });
}));

app.post('/api/actions/explain', limitAI, wrap(async (req, res) => {
  const { option, assessment, gwpIndex, lang = 'en' } = req.body;
  const f = P.facts({ results: resultsFor(assessment, gwpIndex), actions: [option], lang });
  const L = o => (o && typeof o === 'object') ? (o.en || '') : (o || '');
  const src = knowledge.asSources(knowledge.search(`${L(option.title)} ${L(option.condition)} ${f.ecam_results?.country || ''}`, { k: 4, topics: ['plan', 'indonesia', 'ecam'] }));
  const text = await callClaude({
    system: P.fill(P.prompt('system-base'), { LANGUAGE: P.LANG_NAME[lang] }), max_tokens: 700,
    messages: [{ role: 'user', content: P.fill(P.prompt('actions-explain'), { LANGUAGE: P.LANG_NAME[lang] }) +
      '\n\nDATA:\n' + JSON.stringify(f, null, 1) + '\n\nSOURCES:\n' + (src.block || '(none)') }],
  });
  res.json({ text, sources: knowledge.citedSources(text, src.list) });
}));

app.post('/api/plan', limitAI, wrap(async (req, res) => {
  const { actions = [], assessment, gwpIndex, profile, lang = 'en' } = req.body;
  const plan = buildPlan(actions, lang);
  const summary = await P.planSummary({ results: resultsFor(assessment, gwpIndex), actions, plan, profile, lang });
  res.json({ ...plan, summary: summary.text, sources: summary.sources || [], ai: summary.ai });
}));

app.post('/api/guide/parse', limitAI, wrap(async (req, res) => {
  const { filename = 'guide', base64, lang = 'en' } = req.body;
  const buf = Buffer.from(base64 || '', 'base64');
  let text = '';
  if (/\.pdf$/i.test(filename)) text = (await require('pdf-parse/lib/pdf-parse.js')(buf)).text;
  else if (/\.docx$/i.test(filename)) text = (await require('mammoth').extractRawText({ buffer: buf })).value;
  else text = buf.toString('utf8');
  text = text.replace(/\s+\n/g, '\n').trim();
  if (!text) throw new Error('Could not read text from this file.');
  const framework = await P.frameworkFromGuide(text, filename, lang);
  res.json({ framework, guideText: text.slice(0, 60000), chars: text.length });
}));

app.post('/api/proposal', limitAI, wrap(async (req, res) => {
  const { route = 'general', customFramework, guideText, actions, plan, profile, assessment, gwpIndex, lang = 'en' } = req.body;
  const fw = route === 'custom' && customFramework ? customFramework
    : P.financingFrameworks().find(f => f.id === route);
  if (!fw) throw new Error('Unknown financing route ' + route);
  res.json(await P.draftProposal({ results: resultsFor(assessment, gwpIndex), actions, plan, profile, lang }, fw, guideText));
}));

app.post('/api/chat', limitAI, wrap(async (req, res) => {
  const { messages = [], lang = 'en', stage = 'assess', assessment, gwpIndex, focus, actions, plan, profile } = req.body;
  const last = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
  const sources = knowledge.search(`${last} ${focus || ''}`, 6);
  if (!aiEnabled()) {
    // Without an API key the chat still returns the matching guidance passages.
    return res.json({ ai: false, reply: sources.slice(0, 3).map(s => `${s.source}\n${s.text}`).join('\n\n'), sources: sources.map(s => s.source) });
  }
  const src = knowledge.asSources(sources);
  const f = P.facts({ results: resultsFor(assessment, gwpIndex), actions, plan, profile, lang });
  const system = P.fill(P.prompt('system-base'), { LANGUAGE: P.LANG_NAME[lang] }) +
    `\n\nCURRENT STAGE: ${stage}${focus ? `\nUSER IS LOOKING AT: ${focus}` : ''}` +
    `\n\nUTILITY DATA (from ECAM):\n${JSON.stringify(f, null, 1)}` +
    `\n\nSOURCES:\n${src.block}`;
  const reply = await callClaude({ system, max_tokens: 1200,
    messages: messages.slice(-12).map(m => ({ role: m.role, content: String(m.content).slice(0, 8000) })) });
  const cited = knowledge.citedSources(reply, src.list);
  res.json({ reply, sources: cited.map(s => `[${s.id}] ${s.title}${s.heading ? ' — ' + s.heading : ''}`) });
}));

app.post('/api/export', wrap(async (req, res) => {
  const state = req.body;
  const assessment = (state.assessments || [])[state.selectedAssessment || 0];
  const results = (state.assessments || []).map(a => engine.calculateOne(a, state.gwpIndex || 0));
  const docx = state.proposal ? await X.buildProposalDocx({
    lang: state.lang, proposal: state.proposal, results: assessment ? engine.calculateOne(assessment, state.gwpIndex || 0) : null,
    actions: state.selectedActions, plan: state.plan, profile: state.profile,
  }) : null;
  const zip = await X.buildZip({ ...state, results }, docx);
  const name = (state.profile?.name || 'chatwater').replace(/[^\w-]+/g, '_');
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}-chatwater-files.zip"` });
  res.send(zip);
}));

app.post('/api/export/docx', wrap(async (req, res) => {
  const state = req.body;
  const assessment = (state.assessments || [])[state.selectedAssessment || 0];
  const buf = await X.buildProposalDocx({
    lang: state.lang, proposal: state.proposal, results: assessment ? engine.calculateOne(assessment, state.gwpIndex || 0) : null,
    actions: state.selectedActions, plan: state.plan, profile: state.profile,
  });
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'attachment; filename="proposal.docx"' });
  res.send(buf);
}));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  knowledge.load().then(k => {
    console.log(`Knowledge base: ${k.documents} documents, ${k.chunks} passages`, k.byTopic);
    k.errors.forEach(e => console.warn(`  could not read ${e.file}: ${e.error}`));
  }).catch(e => console.error('Knowledge base failed to load:', e));
  app.listen(PORT, () => console.log(`ChatWater Resilience on http://localhost:${PORT} (AI ${aiEnabled() ? 'on: ' + MODEL : 'off'})`));
}
module.exports = app;
