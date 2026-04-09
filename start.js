// ProposalIQ launcher
// Local: node start.js
// Railway: uses npm start directly (this file not used on Railway)

const { spawn } = require('child_process');
const os = require('os');

const isWindows = os.platform() === 'win32';
const cmd = isWindows ? 'npm.cmd' : 'npm';

console.log('');
console.log('  ╔══════════════════════════════════════╗');
console.log('  ║         ProposalIQ                   ║');
console.log('  ╚══════════════════════════════════════╝');
console.log('');
console.log('  Starting… this takes about 10 seconds.');
console.log('  Leave this window open while you work.');
console.log('');

const proc = spawn(cmd, ['run', 'dev'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: isWindows,
  env: { ...process.env },
});

let ready = false;

function handleLine(line) {
  process.stdout.write(line);
  if (!ready && (
    line.includes('Ready in') ||
    line.includes('ready started') ||
    line.includes('✓ Ready') ||
    line.includes('started server')
  )) {
    ready = true;
    console.log('');
    console.log('  ┌──────────────────────────────────────┐');
    console.log('  │                                      │');
    console.log('  │   ✅  READY — Open your browser      │');
    console.log('  │                                      │');
    console.log('  │   👉  http://localhost:3000          │');
    console.log('  │                                      │');
    console.log('  │   To stop: press Ctrl + C            │');
    console.log('  │                                      │');
    console.log('  └──────────────────────────────────────┘');
    console.log('');
  }
}

let stdoutBuf = '';
proc.stdout.on('data', (data) => {
  stdoutBuf += data.toString();
  const lines = stdoutBuf.split('\n');
  stdoutBuf = lines.pop();
  lines.forEach(line => handleLine(line + '\n'));
});

let stderrBuf = '';
proc.stderr.on('data', (data) => {
  stderrBuf += data.toString();
  const lines = stderrBuf.split('\n');
  stderrBuf = lines.pop();
  lines.forEach(line => {
    process.stderr.write(line + '\n');
    handleLine(line + '\n');
  });
});

proc.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.log('');
    console.log('  ⚠  Server stopped unexpectedly.');
    console.log('  Common fixes:');
    console.log('  1. Make sure .env.local exists with your GEMINI_API_KEY');
    console.log('  2. Run: npm install');
    console.log('  3. On Mac: export PATH="/usr/local/opt/node@22/bin:$PATH"');
    console.log('  4. Check the error above for details');
    console.log('');
  }
});

process.on('SIGINT', () => {
  console.log('');
  console.log('  ProposalIQ stopped. Run node start.js to start again.');
  console.log('');
  proc.kill('SIGINT');
  process.exit(0);
});
