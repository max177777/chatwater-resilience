/* Runs every test file in its own process with the offline guard preloaded. Run: npm test */
const { spawnSync } = require('child_process');
const path = require('path');

const FILES = ['participant-ui', 'participant-review', 'utility-identity', 'engine', 'knowledge', 'api', 'integrity', 'import', 'decision-support', 'action-clarity', 'custom-actions', 'context-chat', 'assist-library', 'ai-offline', 'gemini', 'feedback', 'demo-export', 'assessment-validity', 'missing-data', 'project-export', 'document-review', 'readiness', 'preliminary-concept', 'library-release', 'gcf-demo', 'financing-options', 'support-docs'].map(f => path.join(__dirname, `${f}.test.js`));
const guard = path.join(__dirname, 'helpers', 'offline.js');

for (const file of FILES) {
  const r = spawnSync(process.execPath, ['--require', guard, file], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\nFAILED: ${path.basename(file)}`); process.exit(r.status || 1); }
}
