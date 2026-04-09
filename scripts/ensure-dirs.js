const fs = require('fs');
const path = require('path');

// All persistent data under data/ - covered by single Railway volume at /app/data
const dirs = [
  'data',
  'data/uploads',
  'data/uploads/rfp_scans',
  'data/uploads/_tmp',
  'data/uploads/_prescan_tmp',
  'data/uploads/team_cvs',
];

dirs.forEach(dir => {
  const full = path.join(process.cwd(), dir);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
    console.log('Created:', dir);
  }
});
console.log('Directories ready.');
