const path = require('path');
const fs = require('fs');

// Detect Microsoft RMS / Information Protection encrypted files.
// Files protected by Azure RMS or Office 365 sensitivity labels are
// wrapped in a Microsoft compound-file structure beginning with the
// magic prefix "\x00MSMAMARPCRYPT". Standard parsers (pdf-parse,
// mammoth) cannot read them — what looks like a PDF or DOCX is
// actually an encrypted envelope. Without IRM credentials there is no
// way to extract the underlying content. Detect early and return a
// distinctive sentinel so callers can surface a clear message instead
// of a generic "invalid file" error.
const RMS_SENTINEL = '__PIQ_FILE_ENCRYPTED_RMS__';
function isRmsEncrypted(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (n < 14) return false;
    // Match "\x00MSMAMARPCRYPT" — the canonical RMS / Microsoft IRM header.
    return buf.toString('ascii', 1, 14) === 'MSMAMARPCRYPT';
  } catch { return false; }
}

async function parseDocument(filePath) {
  // Defensive guard — some callers have been observed passing non-string
  // values (file descriptors, undefined). Log once with stack so the
  // bad caller can be tracked down, and bail cleanly so analysis isn't
  // silently degraded by a flood of unrelated errors.
  if (typeof filePath !== 'string' || !filePath) {
    console.error('parseDocument received non-string filePath:', { type: typeof filePath, value: filePath, stack: new Error().stack });
    return '';
  }

  // Encrypted-file pre-check — bail before pdf-parse / mammoth get
  // confused by what looks like a malformed file. Returns the sentinel
  // so callers (upload.js, reindex.js) can surface a specific error.
  if (isRmsEncrypted(filePath)) {
    return RMS_SENTINEL;
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

module.exports = { parseDocument, RMS_SENTINEL, isRmsEncrypted };
