const path = require('path');
const fs = require('fs');

async function parseDocument(filePath) {
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

async function parsePDF(fp) {
  const pdfParse = require('pdf-parse');
  const buf = fs.readFileSync(fp);
  const data = await pdfParse(buf);
  return data.text;
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
