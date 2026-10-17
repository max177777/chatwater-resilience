/*
 * Minimal Claude API client (Messages API). Configure with environment vars:
 *   ANTHROPIC_API_KEY  — required for AI features
 *   CLAUDE_MODEL       — optional, default claude-sonnet-5-5
 * Without a key the app still works; AI features return a clear notice.
 * Tests replace the client with setClient(); there is no HTTP or env switch for it.
 */
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';

let injected = null;

function aiEnabled() { return !!injected || !!process.env.ANTHROPIC_API_KEY; }

/** Replace the model client (tests only). fn({ system, messages, max_tokens }) → Promise<string>. Pass null to restore. */
function setClient(fn) { injected = fn; }

const TIMEOUT_MS = +process.env.CLAUDE_TIMEOUT_MS || 60000;

/** Errors from the model provider: HTTP 502 for our clients, distinct from bad input (400) or no key (503). */
function providerError(message, providerStatus) {
  const e = new Error(message);
  e.code = 'PROVIDER'; e.status = 502; e.providerStatus = providerStatus || null;
  return e;
}

async function callClaude({ system, messages, max_tokens = 1500 }) {
  if (injected) {
    try { return await injected({ system, messages, max_tokens }); }
    catch (e) { throw e.code === 'PROVIDER' ? e : providerError(`The AI service failed: ${e.message}`); }
  }
  if (!aiEnabled()) {
    const e = new Error('AI is not configured: set ANTHROPIC_API_KEY on the server.');
    e.code = 'NO_KEY';
    throw e;
  }
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens, system, messages }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw providerError(e.name === 'TimeoutError' ? 'The AI service did not respond in time.' : `The AI service could not be reached: ${e.message}`);
  }
  let data = null;
  try { data = await res.json(); } catch { /* error pages are not always JSON */ }
  if (!res.ok) throw providerError(`The AI service returned an error (${res.status})${data?.error?.message ? ': ' + data.error.message : ''}.`, res.status);
  const text = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  if (!text.trim()) throw providerError('The AI service returned an empty answer.');
  return text;
}

module.exports = { callClaude, aiEnabled, setClient, MODEL };
