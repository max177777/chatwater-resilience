/*
 * Loaded before every test file (node --require). Tests never reach a paid model:
 *   - ANTHROPIC_API_KEY is removed, so AI routes use their template fallback;
 *   - any fetch to a host other than localhost is refused and recorded.
 * Tests that need AI responses inject a fake client with ai.setClient().
 */
delete process.env.ANTHROPIC_API_KEY;

const realFetch = globalThis.fetch;
const blocked = [];
globalThis.__blockedRequests = blocked;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return realFetch(input, init);
  blocked.push(url.href);
  throw new Error(`Blocked external request in tests: ${url.origin}`);
};
