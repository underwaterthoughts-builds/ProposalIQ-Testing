// Worker-thread entrypoint for PDF parsing.
//
// pdf-parse is CPU-bound and synchronous-feeling on large PDFs (30+ MB
// blocks the Node event loop for several seconds, which on a single-core
// Hobby plan stalls every other request behind it including SQLite writes).
//
// This worker reads the file, runs pdf-parse, and posts the text back.
// lib/parser.js spawns one Worker per request via parsePDF().
//
// Spawned with workerData = { filePath: string }.

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');

(async () => {
  try {
    const pdfParse = require('pdf-parse');
    const buf = fs.readFileSync(workerData.filePath);
    const data = await pdfParse(buf);
    parentPort.postMessage({ ok: true, text: data.text || '' });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: e.message });
  }
})();
