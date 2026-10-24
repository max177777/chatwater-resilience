/* Exercise configured-library absence with a guaranteed nonexistent private child path. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'chatwater-absent-'));
try {
  const dir = path.join(parent, 'never-created');
  const r = spawnSync(process.execPath, ['--require', path.join(__dirname, 'helpers/offline.js'), path.join(__dirname, 'context-chat.test.js')], {
    env: { ...process.env, CHATWATER_LIBRARY_DIR: dir }, stdio: 'inherit',
  });
  if (r.error) throw r.error;
  process.exitCode = r.status || (r.signal ? 1 : 0);
} finally { fs.rmSync(parent, { recursive: true, force: true }); }
