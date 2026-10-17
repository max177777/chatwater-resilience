/* Runs every test file in its own process with the offline guard preloaded. Run: npm test */
const { spawnSync } = require('child_process');
const path = require('path');

const FILES = ['engine', 'knowledge', 'api', 'integrity', 'ai-offline'].map(f => path.join(__dirname, `${f}.test.js`));
const guard = path.join(__dirname, 'helpers', 'offline.js');

for (const file of FILES) {
  const r = spawnSync(process.execPath, ['--require', guard, file], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\nFAILED: ${path.basename(file)}`); process.exit(r.status || 1); }
}
