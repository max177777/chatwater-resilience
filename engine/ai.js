/*
 * LLM client used by every AI feature (chat, Explain with AI, plan summary, proposal sections,
 * funding-guide reading, action alternatives). Two providers, chosen by environment variables:
 *
 *   Gemini (Google)         GEMINI_API_KEY      required for Gemini
 *                           GEMINI_MODEL        optional, default gemini-3.8-flash
 *                           GEMINI_THINKING_LEVEL optional: minimal | low | medium | high | off (default low)
 *   Claude (Anthropic)      ANTHROPIC_API_KEY   required for Claude
 *                           CLAUDE_MODEL        optional, default claude-sonnet-5-5
 *   LLM_PROVIDER            optional: gemini | anthropic. Without it, Gemini is used when
 *                           GEMINI_API_KEY is set, otherwise Claude when ANTHROPIC_API_KEY is set.
 *   LLM_TIMEOUT_MS          optional, default 60000 (CLAUDE_TIMEOUT_MS is still read)
 *   GEMINI_API_BASE         optional, default https://generativelanguage.googleapis.com (a proxy, or a local mock for testing)
 *
 * Without a key the app still works; AI features return a clear notice.
 * Callers pass { system, messages: [{ role: 'user' | 'assistant', content }], max_tokens, json? }
 * and get plain text back. Tests replace the client with setClient(); there is no HTTP or env switch for it.
 */
const DEFAULTS = { gemini: 'gemini-3.8-flash', anthropic: 'claude-sonnet-5-5' };

let injected = null;

function provider() {
  const p = String(process.env.LLM_PROVIDER || '').toLowerCase();
  if (p === 'gemini' || p === 'google') return 'gemini';
  if (p === 'anthropic' || p === 'claude') return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}
function keyFor(p) { return p === 'gemini' ? process.env.GEMINI_API_KEY : p === 'anthropic' ? process.env.ANTHROPIC_API_KEY : null; }
function modelFor(p) {
  if (p === 'gemini') return process.env.GEMINI_MODEL || DEFAULTS.gemini;
  if (p === 'anthropic') return process.env.CLAUDE_MODEL || DEFAULTS.anthropic;
  return null;
}

function aiEnabled() { return !!injected || !!keyFor(provider()); }
/** { provider, model } of the live configuration (null values when AI is off). */
function info() {
  if (injected) return { provider: 'test', model: 'test' };
  const p = provider();
  return keyFor(p) ? { provider: p, model: modelFor(p) } : { provider: null, model: null };
}

/** Replace the model client (tests only). fn({ system, messages, max_tokens, json }) → Promise<string>. Pass null to restore. */
function setClient(fn) { injected = fn; }

const timeoutMs = () => +process.env.LLM_TIMEOUT_MS || +process.env.CLAUDE_TIMEOUT_MS || 60000;

/** Errors from the model provider: HTTP 502 for our clients, distinct from bad input (400) or no key (503). */
function providerError(message, providerStatus) {
  const e = new Error(message);
  e.code = 'PROVIDER'; e.status = 502; e.providerStatus = providerStatus || null;
  return e;
}

async function post(url, headers, body) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs()) });
  } catch (e) {
    throw providerError(e.name === 'TimeoutError' ? 'The AI service did not respond in time.' : `The AI service could not be reached: ${e.message}`);
  }
  let data = null;
  try { data = await res.json(); } catch { /* error pages are not always JSON */ }
  if (!res.ok) throw providerError(`The AI service returned an error (${res.status})${data?.error?.message ? ': ' + data.error.message : ''}.`, res.status);
  return data;
}

/** An answer cut off at the output limit is not a finished text: callers fall back or report the failure. */
function incompleteError() {
  const e = providerError('The AI answer was cut off before it finished (output limit reached); the partial text was not used.');
  e.incomplete = true;
  return e;
}

// ------------------------------------------------------------ Anthropic (Claude)
async function callAnthropic({ system, messages, max_tokens }) {
  const data = await post('https://api.anthropic.com/v1/messages',
    { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    { model: modelFor('anthropic'), max_tokens: anthropicMaxTokens(max_tokens), system, messages });
  return anthropicText(data);
}
/**
 * Callers' max_tokens is the intended answer size; the prompts set the actual length. With document
 * excerpts in the context, answers that cite several sources can run past that size, and a cut-off
 * answer is rejected. Leave headroom (as for Gemini's thinking tokens) so a complete answer fits.
 * LLM_MAX_OUTPUT_TOKENS overrides the headroom-adjusted value.
 */
function anthropicMaxTokens(requested) {
  const override = +process.env.LLM_MAX_OUTPUT_TOKENS;
  if (Number.isFinite(override) && override > 0) return Math.round(override);
  const base = +requested || 1500;
  return Math.max(base * 2, base + 2048);
}
function anthropicText(data) {
  const text = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  if (data?.stop_reason === 'max_tokens') throw incompleteError();
  return text;
}

// ------------------------------------------------------------ Gemini (Google)
/** Our messages → Gemini contents: roles user/model, consecutive turns of the same role merged, starting with the user. */
function geminiContents(messages) {
  const out = [];
  for (const m of messages || []) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const text = String(m.content == null ? '' : m.content);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += '\n\n' + text;
    else out.push({ role, parts: [{ text }] });
  }
  if (out.length && out[0].role !== 'user') out.unshift({ role: 'user', parts: [{ text: '(conversation continues)' }] });
  return out;
}
function geminiRequest({ system, messages, max_tokens, json }) {
  const level = String(process.env.GEMINI_THINKING_LEVEL || 'low').toLowerCase();
  const generationConfig = {
    // Gemini counts its thinking tokens against maxOutputTokens: leave room so the answer itself is not cut off
    maxOutputTokens: (max_tokens || 1500) + (level === 'off' ? 0 : 4096),
    temperature: 0.4,
  };
  if (level !== 'off') generationConfig.thinkingConfig = { thinkingLevel: level };
  if (json) generationConfig.responseMimeType = 'application/json';
  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: geminiContents(messages),
    generationConfig,
  };
}
function geminiText(data) {
  if (data?.promptFeedback?.blockReason) throw providerError(`The AI service declined the request (${data.promptFeedback.blockReason}).`);
  const c = (data?.candidates || [])[0];
  if (!c) throw providerError('The AI service returned no answer.');
  const text = ((c.content && c.content.parts) || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
  if (!text.trim() && ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(c.finishReason)) {
    throw providerError(`The AI service declined the request (${c.finishReason}).`);
  }
  if (!text.trim() && c.finishReason === 'MAX_TOKENS') throw providerError('The AI service ran out of output space before answering.');
  // thinking tokens count against the same limit, so a long reasoning phase can cut the answer mid-sentence
  if (c.finishReason === 'MAX_TOKENS') throw incompleteError();
  return text;
}
async function callGemini(req) {
  const model = encodeURIComponent(modelFor('gemini'));
  const base = String(process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const data = await post(`${base}/v1beta/models/${model}:generateContent`,
    { 'x-goog-api-key': process.env.GEMINI_API_KEY }, geminiRequest(req));
  return geminiText(data);
}

/** Send one request to the configured model and return its text. */
async function callLLM({ system, messages, max_tokens = 1500, json = false }) {
  if (injected) {
    try { return await injected({ system, messages, max_tokens, json }); }
    catch (e) { throw e.code === 'PROVIDER' ? e : providerError(`The AI service failed: ${e.message}`); }
  }
  const p = provider();
  if (!keyFor(p)) {
    const e = new Error('AI is not configured: set GEMINI_API_KEY (or ANTHROPIC_API_KEY) on the server.');
    e.code = 'NO_KEY';
    throw e;
  }
  const text = p === 'gemini' ? await callGemini({ system, messages, max_tokens, json }) : await callAnthropic({ system, messages, max_tokens });
  if (!text || !text.trim()) throw providerError('The AI service returned an empty answer.');
  return text;
}

/** Parse a JSON answer, tolerating code fences or text around the object. */
function parseJson(text) {
  const s = String(text || '');
  try { return JSON.parse(s); } catch { /* fall through */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* fall through */ } }
  throw providerError('The AI service returned an answer that could not be read.');
}

module.exports = {
  callLLM, callClaude: callLLM, aiEnabled, info, setClient, parseJson,
  get MODEL() { return info().model; },
  // for tests
  _geminiRequest: geminiRequest, _geminiText: geminiText, _anthropicText: anthropicText, _geminiContents: geminiContents, _provider: provider,
};
