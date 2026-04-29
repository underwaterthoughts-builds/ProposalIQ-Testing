const path = require('path');
const fs = require('fs');

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
    console.error('parseDocument error:', {
      ext,
      filePath,
      pathType: typeof filePath,
      pathLen: filePath?.length,
      message: e.message,
      stack: e.stack?.split('\n').slice(0, 5).join('\n'),
    });
  }
  return '';
}

// PDF parsing runs inline on the request thread.
//
// We previously offloaded this to a worker_thread for perf, but Next.js
// bundles `require.resolve('./parser-worker.js')` to a webpack module ID
// (a number, not a path) in production, which then fed garbage to
// `new Worker(...)` — every PDF parse silently failed and the AI
// extractor saw empty text. Inline parse blocks the event loop for ~1-2s
// on a typical 30-page proposal, which is acceptable since the batch
// upload caller already staggers requests 3s apart.
async function parsePDF(fp) {
  const pdfParse = require('pdf-parse');
  const buf = fs.readFileSync(fp);
  const data = await pdfParse(buf);
  return data.text || '';
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
