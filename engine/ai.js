/*
 * Minimal Claude API client (Messages API). Configure with environment vars:
 *   ANTHROPIC_API_KEY  — required for AI features
 *   CLAUDE_MODEL       — optional, default claude-sonnet-5-5
 * Without a key the app still works; AI features return a clear notice.
 */
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';

function aiEnabled() { return !!process.env.ANTHROPIC_API_KEY; }

async function callClaude({ system, messages, max_tokens = 1500 }) {
  if (!aiEnabled()) {
    const e = new Error('AI is not configured: set ANTHROPIC_API_KEY on the server.');
    e.code = 'NO_KEY';
    throw e;
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens, system, messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Claude API error ${res.status}`);
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

module.exports = { callClaude, aiEnabled, MODEL };
