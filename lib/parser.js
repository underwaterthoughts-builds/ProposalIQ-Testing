const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');

async function parseDocument(filePath) {
  // Defensive guard — some callers have been observed passing non-string
  // values (file descriptors, undefined). Log once with stack so the
  // bad caller can be tracked down, and bail cleanly so analysis isn't
  // silently degraded by a flood of unrelated errors.
  if (typeof filePath !== 'string' || !filePath) {
    console.error('parseDocument received non-string filePath:', { type: typeof filePath, value: filePath, stack: new Error().stack });
    return '';
  }
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.pdf') return await parsePDF(filePath);
    if (ext === '.docx' || ext === '.doc') return await parseDOCX(filePath);
    if (['.xlsx', '.xls', '.csv'].includes(ext)) return parseSheet(filePath);
    if (['.txt', '.md'].includes(ext)) return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error('parseDocument error:', e.message);
  }
  return '';
}

// PDF parsing offloaded to a worker thread (Wave 6 Phase 3 perf fix).
// pdf-parse is CPU-bound and was running on the request thread, blocking
// the Node event loop for several seconds on 30+ MB PDFs and stalling
// SQLite writers behind it on the single-core Hobby plan. The worker
// pattern keeps the main thread responsive while the parse runs.
//
// Falls back to inline parse if the worker file isn't packaged (e.g.
// during local dev with a stale build); the fallback restores the
// previous blocking behaviour but at least keeps the feature working.
function parsePDF(fp) {
  return new Promise((resolve, reject) => {
    let workerPath;
    try {
      workerPath = require.resolve('./parser-worker.js');
    } catch {
      // Fallback: inline parse on the request thread (dev safety net)
      const pdfParse = require('pdf-parse');
      const buf = fs.readFileSync(fp);
      return pdfParse(buf).then(d => resolve(d.text)).catch(reject);
    }
    const worker = new Worker(workerPath, { workerData: { filePath: fp } });
    let settled = false;
    const settleOnce = (fn) => (val) => { if (!settled) { settled = true; fn(val); } };
    const ok = settleOnce(resolve);
    const fail = settleOnce(reject);
    worker.on('message', (msg) => {
      if (msg?.ok) ok(msg.text);
      else fail(new Error(msg?.error || 'PDF worker failed'));
    });
    worker.on('error', fail);
    worker.on('exit', (code) => {
      if (code !== 0) fail(new Error(`PDF worker exited with code ${code}`));
    });
  });
}

async function parseDOCX(fp) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ path: fp });
  return result.value;
}

function parseSheet(fp) {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(fp);
  return wb.SheetNames.map(n => `Sheet: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n');
}

module.exports = { parseDocument };
