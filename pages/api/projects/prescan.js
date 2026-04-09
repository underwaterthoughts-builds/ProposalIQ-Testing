import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../../../lib/auth';
import { ensureDir } from '../../../lib/storage';
import { parseDocument } from '../../../lib/parser';
import { prescanDocument } from '../../../lib/gemini';

export const config = { api: { bodyParser: false } };

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const tmpDir = path.join(process.cwd(),'data','uploads','_prescan_tmp');
  ensureDir(tmpDir);
  const form = formidable({ uploadDir:tmpDir, keepExtensions:true, maxFileSize:50*1024*1024 });
  let files;
  try {
    [,files] = await new Promise((resolve, reject) => {
      form.parse(req, (err,f,fi) => { if(err) reject(err); else resolve([f,fi]); });
    });
  } catch(e) { return res.status(400).json({ error:'Upload failed: '+e.message }); }

  const fileArr = files['proposal']||files['rfp']||files['budget']||Object.values(files)[0];
  const uploaded = Array.isArray(fileArr)?fileArr[0]:fileArr;
  if (!uploaded?.filepath) return res.status(400).json({ error:'No file received' });

  let text = '';
  try { text = await parseDocument(uploaded.filepath); } catch(e) { console.error('Prescan parse:',e.message); }
  try { fs.unlinkSync(uploaded.filepath); } catch {}

  if (!text||text.trim().length<50) {
    return res.status(200).json({ extracted:{}, confidence:'low', note:'Could not extract enough text. Please fill in details manually.' });
  }

  const filenameHint = uploaded.originalFilename || uploaded.filepath || '';
  const result = await prescanDocument(text, filenameHint, uploaded.filepath || null);
  return res.status(200).json({ ...result, text_length:text.length });
}

export default requireAuth(handler);
