import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { canAccess } from '../../../lib/tenancy';
import { embed, analyseCv } from '../../../lib/gemini';
import { safe } from '../../../lib/embeddings';
import { parseDocument } from '../../../lib/parser';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { ensureDir } from '../../../lib/storage';

export const config = { api: { bodyParser: false } };

async function handler(req, res) {
  const db = getDb();
  const { id } = req.query;

  // Tenant gate — all methods target a specific team_members row, so check once.
  const ownerRow = db.prepare('SELECT owner_user_id FROM team_members WHERE id=?').get(id);
  if (!ownerRow || !canAccess(req.user, ownerRow)) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method === 'GET') {
    const m = db.prepare('SELECT * FROM team_members WHERE id=?').get(id);
    if (!m) return res.status(404).json({ error:'Not found' });
    const history = db.prepare(`SELECT pt.*,p.name as project_name,p.outcome,p.user_rating,p.sector,p.date_submitted FROM project_team pt JOIN projects p ON p.id=pt.project_id WHERE pt.member_id=?`).all(id);
    return res.status(200).json({ member:{ ...m,stated_specialisms:safe(m.stated_specialisms,[]),cv_extracted:safe(m.cv_extracted,{}) }, history });
  }

  if (req.method === 'PATCH') {
    // Handle multipart (CV upload) or JSON (field update)
    const contentType = req.headers['content-type']||'';

    if (contentType.includes('multipart')) {
      // CV upload
      const cvDir = path.join(process.cwd(),'data','uploads','team_cvs');
      ensureDir(cvDir);
      const form = formidable({ uploadDir:cvDir, keepExtensions:true, maxFileSize:20*1024*1024 });
      let fields, files;
      try {
        [fields,files] = await new Promise((resolve,reject)=>{ form.parse(req,(err,f,fi)=>{ if(err) reject(err); else resolve([f,fi]); }); });
      } catch(e) { return res.status(400).json({ error:'Upload failed: '+e.message }); }

      const cvFile = Array.isArray(files['cv'])?files['cv'][0]:files['cv'];
      if (!cvFile?.filepath) return res.status(400).json({ error:'No CV file received' });

      const newName = `cv_${id}${path.extname(cvFile.originalFilename||cvFile.filepath)}`;
      const newPath = path.join(cvDir, newName);
      fs.renameSync(cvFile.filepath, newPath);

      let cvExtracted = {};
      try {
        const text = await parseDocument(newPath);
        if (text.length > 50) cvExtracted = await analyseCv(text);
      } catch(e) { console.error('CV analysis:',e.message); }

      // Re-embed with CV data
      const current = db.prepare('SELECT * FROM team_members WHERE id=?').get(id);
      if (current) {
        const specs = safe(current.stated_specialisms,[]);
        const cvSectors = cvExtracted.sectors||[];
        const cvTech = cvExtracted.technologies||[];
        const embText = [current.name,current.title,...specs,...cvSectors,...cvTech,current.stated_sectors||'',current.bio||'',cvExtracted.career_summary||''].join(' ');
        let emb = null;
        try { emb = JSON.stringify(await embed(embText)); } catch {}
        db.prepare('UPDATE team_members SET cv_filename=?,cv_extracted=?,embedding=? WHERE id=?').run(newName,JSON.stringify(cvExtracted),emb,id);
      }

      return res.status(200).json({ ok:true, extracted:cvExtracted });
    }

    // JSON patch
    // Need to read body manually since bodyParser:false
    const body = await new Promise((resolve)=>{
      let raw=''; req.on('data',c=>raw+=c); req.on('end',()=>{ try{resolve(JSON.parse(raw||'{}'));}catch{resolve({});} });
    });
    const allowed = ['name','title','years_experience','day_rate_client','day_rate_cost','availability','stated_specialisms','stated_sectors','bio','color'];
    const updates=[]; const vals=[];
    for (const [k,v] of Object.entries(body)) {
      if (!allowed.includes(k)) continue;
      updates.push(`${k}=?`);
      vals.push(k==='stated_specialisms'?JSON.stringify(v):v);
    }
    if (!updates.length) return res.status(400).json({ error:'Nothing to update' });
    const current = db.prepare('SELECT * FROM team_members WHERE id=?').get(id);
    if (current) {
      const merged = { ...current, ...body };
      const specs = Array.isArray(merged.stated_specialisms)?merged.stated_specialisms:safe(merged.stated_specialisms,[]);
      const cvExtracted = safe(current.cv_extracted,{});
      const embText = [merged.name,merged.title,...specs,...(cvExtracted.sectors||[]),...(cvExtracted.technologies||[]),merged.stated_sectors||'',merged.bio||''].join(' ');
      try { updates.push('embedding=?'); vals.push(JSON.stringify(await embed(embText))); } catch {}
    }
    db.prepare(`UPDATE team_members SET ${updates.join(',')} WHERE id=?`).run(...vals,id);
    return res.status(200).json({ ok:true });
  }

  if (req.method === 'DELETE') {
    db.prepare('DELETE FROM team_members WHERE id=?').run(id);
    return res.status(200).json({ ok:true });
  }
  return res.status(405).end();
}
export default requireAuth(handler);
