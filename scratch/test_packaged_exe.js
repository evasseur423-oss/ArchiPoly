const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const exePath = path.join(__dirname, '..', 'dist', 'win-unpacked', 'ArchiPoly.exe');
console.log('[Test Packaged] Launching:', exePath);

const proc = spawn(exePath, [], {
  detached: false,
  stdio: 'ignore'
});

async function run() {
  console.log('[Test Packaged] Process spawned (PID: ' + proc.pid + '). Waiting 5s for server boot...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('[Test Packaged] Fetching http://localhost:3800/api/materials ...');
  const req = http.get('http://localhost:3800/api/materials', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const categories = Object.keys(json);
        let total = 0;
        categories.forEach(c => total += json[c].length);
        console.log('[Test Packaged] SUCCESS! Categories found:', categories.length, 'Total materials:', total);
      } catch (e) {
        console.error('[Test Packaged] JSON parse error:', e.message);
      } finally {
        cleanup();
      }
    });
  });

  req.on('error', (err) => {
    console.error('[Test Packaged] Connection error:', err.message);
    cleanup();
  });
}

function cleanup() {
  console.log('[Test Packaged] Terminating test process...');
  try {
    process.kill(proc.pid, 'SIGKILL');
  } catch (_) {}
  // Also taskkill on windows
  try {
    const { execSync } = require('child_process');
    execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' });
  } catch (_) {}
  console.log('[Test Packaged] Test finished.');
  process.exit(0);
}

run();
