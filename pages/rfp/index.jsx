import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { Btn, Card, Badge, Spinner, Toast } from '../../components/ui';
import { useUser } from '../../lib/useUser';
import { useMode } from '../../lib/useMode';

export default function RFPIndex() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const { isQuick } = useMode();
  const [scans, setScans] = useState([]);
  const [file, setFile] = useState(null);
  const [scanName, setScanName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const fileRef = useRef();

  useEffect(() => { loadScans(); }, []);

  async function loadScans() {
    try {
      const r = await fetch('/api/rfp/scan');
      const d = await r.json();
      setScans(d.scans || []);
    } catch {}
  }

  async function startScan() {
    if (!file) { setToast('Please select an RFP file first'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('rfp', file);
      fd.append('name', scanName || file.name.replace(/\.[^.]+$/, ''));
      const r = await fetch('/api/rfp/scan', { method: 'POST', body: fd });
      if (r.ok) {
        const d = await r.json();
        router.push(`/rfp/${d.scanId}`);
      } else {
        setToast('Upload failed — please try again');
        setUploading(false);
      }
    } catch (e) {
      setToast('Error: ' + e.message);
      setUploading(false);
    }
  }

  async function deleteScan(e, id) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this scan? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/rfp/${id}`, { method: 'DELETE' });
      if (r.ok) {
        setScans(prev => prev.filter(s => s.id !== id));
        setToast('Scan deleted');
      } else setToast('Delete failed');
    } catch { setToast('Delete failed'); }
    setDeletingId(null);
  }

  if (authLoading) return null;
  if (!user) return null;

  return (
    <>
      <Head><title>RFP Intelligence — ProposalIQ</title></Head>
      <Layout title="RFP Intelligence" subtitle="Upload an RFP to scan your repository" user={user}>
        <div className="h-full overflow-y-auto px-4 md:px-6 py-4 md:py-6" style={{ background: '#faf7f2' }}>
          <div className="max-w-2xl mx-auto px-4 md:px-0">
            <Card className="mb-6 p-6">
              <h2 className="font-serif text-xl mb-1">New Intelligence Scan</h2>
              <p className="text-sm mb-5" style={{ color: '#6b6456' }}>
                {isQuick
                  ? 'Upload your RFP. Get a decision brief in 60 seconds — fit signal, priorities, risks, and your angle.'
                  : 'Upload an RFP or tender document. ProposalIQ will cross-reference your entire repository, identify gaps, scan for relevant industry news, and suggest the right team.'}
              </p>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: '#6b6456' }}>Scan Name (optional)</label>
                <input value={scanName} onChange={e => setScanName(e.target.value)}
                  placeholder="e.g. NHS Digital Phase 3 — March 2026"
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none bg-paper focus:bg-white focus:border-teal mb-4"
                  style={{ borderColor: '#ddd5c4' }} />
              </div>

              <input type="file" ref={fileRef} className="hidden" accept=".pdf,.docx,.doc,.txt"
                onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]); }} />

              <div onClick={() => fileRef.current.click()}
                className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-all mb-4 ${file ? 'border-teal bg-teal-pale' : 'border-[#ddd5c4] hover:border-teal/50 hover:bg-cream'}`}>
                <div className="text-3xl mb-2">{file ? '📋' : '⊡'}</div>
                {file ? (
                  <>
                    <div className="text-sm font-semibold mb-1" style={{ color: '#1e4a52' }}>{file.name}</div>
                    <div className="text-xs font-mono" style={{ color: '#6b6456' }}>{(file.size / 1024).toFixed(0)} KB · click to change</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium mb-1">Drop RFP here or click to browse</div>
                    <div className="text-xs" style={{ color: '#6b6456' }}>PDF, DOCX, DOC, or TXT · Up to 30MB</div>
                  </>
                )}
              </div>

              <Btn variant="teal" onClick={startScan} disabled={uploading || !file} className="w-full justify-center py-2.5">
                {uploading ? <><Spinner size={14} /> Processing — 30–60 seconds…</> : '⟳ Run Intelligence Scan'}
              </Btn>
            </Card>

            {scans.length > 0 && (
              <div>
                <h2 className="font-serif text-lg mb-3">Previous Scans</h2>
                <div className="space-y-2">
                  {scans.map(s => (
                    <Link key={s.id} href={`/rfp/${s.id}`}>
                      <Card className="flex items-center gap-4 p-4 hover:shadow-md cursor-pointer transition-all group">
                        <span className="text-2xl">⊡</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{s.name}</div>
                          <div className="text-xs font-mono" style={{ color: '#6b6456' }}>
                            {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                        <Badge color={s.status === 'complete' ? 'sage' : s.status === 'processing' ? 'gold' : 'rust'}>{s.status}</Badge>
                        <span className="text-xs" style={{ color: '#1e4a52' }}>View →</span>
                        <button
                          onClick={e => deleteScan(e, s.id)}
                          disabled={deletingId === s.id}
                          className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 px-2 py-1 rounded text-xs hover:bg-red-50"
                          style={{ color: '#b04030' }}
                          title="Delete this scan">
                          {deletingId === s.id ? <Spinner size={10} /> : '✕'}
                        </button>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />
    </>
  );
}
