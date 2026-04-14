import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { useUser } from '../../lib/useUser';

function StatusPill({ status }) {
  if (status === 'complete' || status === 'fast_ready') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-label text-[10px] uppercase">
        <span className="w-1 h-1 rounded-full bg-primary" />
        Complete
      </span>
    );
  }
  if (status === 'processing' || status === 'indexing') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-outline-variant/20 text-on-surface-variant font-label text-[10px] uppercase">
        <span className="w-1 h-1 rounded-full bg-outline-variant animate-ping" />
        Processing
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container/20 text-error font-label text-[10px] uppercase">
        <span className="w-1 h-1 rounded-full bg-error" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label text-[10px] uppercase">
      {status || 'Pending'}
    </span>
  );
}

export default function RFPIndex() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const [scans, setScans] = useState([]);
  const [file, setFile] = useState(null);
  const [scanName, setScanName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [showLimit, setShowLimit] = useState(5);
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

  const visible = scans.slice(0, showLimit);
  const hasMore = scans.length > showLimit;

  return (
    <>
      <Head><title>RFP Intelligence — ProposalIQ</title></Head>
      <Layout title="RFP Intelligence" user={user}>
        <div className="min-h-screen pb-20 flex flex-col items-center">
          <div className="w-full max-w-[720px] px-6 pt-8 md:pt-12">

            {/* Editorial header */}
            <header className="mb-12">
              <p className="font-label text-xs uppercase tracking-widest text-primary mb-2">Scan Intelligence</p>
              <h1 className="font-headline text-4xl md:text-5xl font-bold text-on-surface tracking-tight">RFP Repository</h1>
              <p className="font-body text-on-surface-variant mt-4 text-lg leading-relaxed">
                Upload your latest Request for Proposal to extract key requirements, deadlines, and strategic insights using the ProposalIQ lens.
              </p>
            </header>

            {/* Upload card */}
            <section className="bg-surface p-8 rounded-xl relative overflow-hidden group mb-16 shadow-2xl border border-outline-variant/30">
              <div
                className="absolute inset-4 rounded-lg pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%234d4636' stroke-width='2' stroke-dasharray='8%2c 12' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e")`,
                }}
              />
              <div className="relative z-10 flex flex-col items-center justify-center py-8 md:py-12 text-center">
                <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mb-6 text-primary">
                  <span className="material-symbols-outlined text-3xl">upload_file</span>
                </div>
                <h3 className="font-headline text-2xl font-bold text-on-surface mb-2">
                  {file ? 'Ready to Scan' : 'Upload RFP Document'}
                </h3>
                <p className="font-body text-on-surface-variant mb-6 max-w-[360px] mx-auto">
                  {file
                    ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB`
                    : 'Drag and drop your PDF or DOCX file here to begin the intelligence scan.'}
                </p>

                {/* Optional scan name */}
                <div className="w-full max-w-sm mb-4">
                  <input
                    value={scanName}
                    onChange={e => setScanName(e.target.value)}
                    placeholder="Optional scan name (e.g. NHS Digital — Q1)"
                    className="w-full bg-transparent border-0 border-b border-outline-variant py-2 px-0 text-on-surface text-sm placeholder:text-on-surface-variant/40 focus:ring-0 focus:border-primary focus:outline-none transition-all"
                  />
                </div>

                <input
                  type="file"
                  ref={fileRef}
                  className="hidden"
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]); }}
                />

                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    onClick={() => fileRef.current.click()}
                    className="border border-outline/30 text-on-surface px-6 py-3 rounded-md font-bold text-sm hover:bg-surface-container-high transition-colors"
                  >
                    {file ? 'Change File' : 'Select File'}
                  </button>
                  <button
                    onClick={startScan}
                    disabled={uploading || !file}
                    className="bg-primary text-on-primary font-bold px-8 py-3 rounded-md hover:brightness-110 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>{uploading ? 'Processing…' : 'Start Scan'}</span>
                    <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                  </button>
                </div>
                {toast && (
                  <p className="mt-4 text-xs text-error font-label uppercase tracking-widest">{toast}</p>
                )}
              </div>
            </section>

            {/* Previous scans */}
            {scans.length > 0 && (
              <section className="space-y-6">
                <div className="flex justify-between items-end border-b border-outline-variant/30 pb-4">
                  <h2 className="font-headline text-2xl font-bold text-on-surface">Previous Scans</h2>
                  <span className="font-label text-xs text-on-surface-variant uppercase tracking-widest">
                    Showing {Math.min(showLimit, scans.length)} of {scans.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {visible.map(s => (
                    <Link key={s.id} href={`/rfp/${s.id}`}>
                      <div className="group flex items-center justify-between p-4 bg-surface-container-lowest/90 backdrop-blur-sm border border-outline-variant/20 hover:bg-surface-container transition-colors rounded-lg shadow-lg cursor-pointer">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`p-2 rounded flex-shrink-0 ${
                            s.status === 'processing' || s.status === 'indexing'
                              ? 'bg-surface-container-high text-on-surface-variant'
                              : 'bg-surface-container-high text-primary'
                          }`}>
                            <span
                              className={`material-symbols-outlined ${
                                s.status === 'processing' || s.status === 'indexing' ? 'animate-pulse' : ''
                              }`}
                            >
                              {s.status === 'processing' || s.status === 'indexing' ? 'data_exploration' : 'description'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-body font-bold text-on-surface truncate">{s.name}</h4>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-tighter">
                                {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                              <StatusPill status={s.status} />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="font-label text-xs font-bold text-primary uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                            View
                          </span>
                          <button
                            onClick={e => deleteScan(e, s.id)}
                            disabled={deletingId === s.id}
                            className="text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity p-1"
                            title="Delete scan"
                          >
                            <span className="material-symbols-outlined text-base">close</span>
                          </button>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {hasMore && (
                  <button
                    onClick={() => setShowLimit(l => l + 10)}
                    className="w-full py-4 text-center font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant hover:text-primary transition-colors"
                  >
                    Load Archive
                  </button>
                )}
              </section>
            )}
          </div>
        </div>
      </Layout>
    </>
  );
}
