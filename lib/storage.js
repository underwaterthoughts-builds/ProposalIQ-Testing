const path = require('path');
const fs = require('fs');

// All persistent data lives under /app/data so one Railway volume covers everything
const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS = path.join(DATA_DIR, 'uploads');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function projectDir(projectId) {
  const d = path.join(UPLOADS, projectId);
  ensureDir(d);
  return d;
}

function filePath(projectId, filename) { return path.join(UPLOADS, projectId, filename); }
function readFile(projectId, filename) { return fs.readFileSync(filePath(projectId, filename)); }
function deleteFile(projectId, filename) {
  const fp = filePath(projectId, filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

module.exports = { DATA_DIR, UPLOADS, projectDir, filePath, readFile, deleteFile, ensureDir };
