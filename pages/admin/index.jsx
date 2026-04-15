import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { Spinner, Toast } from '../../components/ui';
import { useUser } from '../../lib/useUser';

// Phase-1 admin dashboard. Two panels:
//   · AI cost summary — sourced from /api/admin/cost-summary
//   · Audit log       — sourced from /api/admin/audit
//
// Users management lives at /users (already exists, extended with role
// toggle / disable / view-as buttons). This page is the operational
// view: who's spending what and who did what.
export default function AdminDashboard() {
  const { user, loading } = useUser();
  const [windowDays, setWindowDays] = useState(30);
  const [costs, setCosts] = useState(null);
  const [audit, setAudit] = useState(null);
  const [auditLimit, setAuditLimit] = useState(100);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    fetch(`/api/admin/cost-summary?days=${windowDays}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setCosts(d))
      .catch(() => setToast('Cost summary failed'));
  }, [user, windowDays]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    fetch(`/api/admin/audit?limit=${auditLimit}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setAudit(d))
      .catch(() => setToast('Audit log failed'));
  }, [user, auditLimit]);

  if (loading || !user) return null;
  if (user.role !== 'admin') {
    return (
      <Layout title="Admin" user={user}>
        <div className="min-h-screen pt-24 text-center text-on-surface-variant">Admin only.</div>
      </Layout>
    );
  }

  const fmtMoney = (v) => `$${Number(v || 0).toFixed(2)}`;

  return (
    <>
      <Head><title>Admin — ProposalIQ</title></Head>
      <Layout title="Admin" subtitle="Operational dashboard" user={user}
        actions={
          <Link href="/users" className="text-[11px] font-label uppercase tracking-widest px-3 py-2 border border-outline/30 text-on-surface-variant hover:text-on-surface transition-all">
            Users →
          </Link>
        }
      >
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-8 md:py-12 space-y-12">

          {/* ── AI cost summary ─────────────────────────────────────── */}
          <section>
            <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
              <div>
                <span className="font-label text-[11px] uppercase tracking-widest text-primary">Spend</span>
                <h2 className="font-headline text-3xl font-light tracking-tight text-on-surface mt-1">AI cost summary</h2>
                <p className="text-sm text-on-surface-variant mt-1">Pulled from the ai_cost_log table — every model call is tracked.</p>
              </div>
              <div className="inline-flex items-center bg-surface-container-lowest border border-outline-variant/20 rounded-sm overflow-hidden">
                {[7, 30, 90].map(d => (
                  <button key={d} onClick={() => setWindowDays(d)}
                    className={`px-3 py-1.5 text-[11px] font-label uppercase tracking-widest ${windowDays === d ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}>
                    {d} days
                  </button>
                ))}
              </div>
            </div>

            {!costs ? <Spinner /> : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Total spend', value: fmtMoney(costs.totals?.total_cost), sub: `${costs.totals?.calls?.toLocaleString() || 0} calls` },
                    { label: 'Input tokens', value: (costs.totals?.total_input_tokens || 0).toLocaleString(), sub: `last ${windowDays}d` },
                    { label: 'Output tokens', value: (costs.totals?.total_output_tokens || 0).toLocaleString(), sub: `last ${windowDays}d` },
                    { label: 'Models used', value: (costs.by_model || []).length, sub: 'distinct' },
                  ].map(m => (
                    <div key={m.label} className="bg-surface-container-lowest border border-outline-variant/10 p-4 rounded-sm">
                      <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">{m.label}</span>
                      <div className="font-headline text-2xl font-bold text-primary">{m.value}</div>
                      {m.sub && <div className="text-[10px] font-label text-outline mt-1">{m.sub}</div>}
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <CostTable title="By category" rows={(costs.by_category || []).map(r => ({ name: r.category || 'unknown', cost: r.cost, calls: r.calls }))} />
                  <CostTable title="By model" rows={(costs.by_model || []).map(r => ({ name: r.model, cost: r.cost, calls: r.calls }))} />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <CostTable title="Top scans (by spend)" rows={(costs.top_scans || []).map(r => ({ name: r.scan_name || r.scan_id, cost: r.cost, calls: r.calls }))} />
                  <CostTable title="Top projects (by spend)" rows={(costs.top_projects || []).map(r => ({ name: r.project_name || r.project_id, cost: r.cost, calls: r.calls }))} />
                </div>

                {(costs.by_day || []).length > 0 && (
                  <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-sm overflow-hidden">
                    <div className="px-4 py-2 bg-surface-container-high text-[10px] font-label uppercase tracking-widest text-on-surface-variant">By day</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {costs.by_day.map(d => (
                          <tr key={d.day} className="border-t border-outline-variant/10">
                            <td className="px-4 py-2 text-on-surface-variant">{d.day}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-on-surface">{fmtMoney(d.cost)}</td>
                            <td className="px-4 py-2 text-right text-outline tabular-nums">{d.calls} calls</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Audit log ───────────────────────────────────────────── */}
          <section>
            <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
              <div>
                <span className="font-label text-[11px] uppercase tracking-widest text-primary">Trail</span>
                <h2 className="font-headline text-3xl font-light tracking-tight text-on-surface mt-1">Audit log</h2>
                <p className="text-sm text-on-surface-variant mt-1">Role changes, disables, deletions, and impersonation sessions are recorded here.</p>
              </div>
              <div className="inline-flex items-center bg-surface-container-lowest border border-outline-variant/20 rounded-sm overflow-hidden">
                {[100, 250, 500].map(n => (
                  <button key={n} onClick={() => setAuditLimit(n)}
                    className={`px-3 py-1.5 text-[11px] font-label uppercase tracking-widest ${auditLimit === n ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}>
                    Last {n}
                  </button>
                ))}
              </div>
            </div>
            {!audit ? <Spinner /> : (audit.entries || []).length === 0 ? (
              <p className="text-sm text-on-surface-variant">Nothing to show yet.</p>
            ) : (
              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-container-high">
                      {['When', 'Action', 'Acting as', 'Real admin', 'Target', 'IP'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audit.entries.map(e => (
                      <tr key={e.id} className="border-t border-outline-variant/10">
                        <td className="px-3 py-2 text-outline whitespace-nowrap text-xs tabular-nums">{e.created_at}</td>
                        <td className="px-3 py-2"><span className="font-label text-[10px] uppercase tracking-widest text-primary">{e.action}</span></td>
                        <td className="px-3 py-2 text-on-surface">{e.user_name || e.user_id || '—'}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{e.impersonator_name ? `${e.impersonator_name} (impersonating)` : ''}</td>
                        <td className="px-3 py-2 text-on-surface-variant text-xs">{e.target_type ? `${e.target_type}:${(e.target_id || '').slice(0, 8)}` : ''}</td>
                        <td className="px-3 py-2 text-outline text-xs tabular-nums">{e.ip || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />
    </>
  );
}

function CostTable({ title, rows }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-sm overflow-hidden">
      <div className="px-4 py-2 bg-surface-container-high text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{title}</div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-outline">Nothing yet.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-outline-variant/10">
                <td className="px-4 py-2 text-on-surface truncate">{r.name || 'unknown'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-primary font-bold">${Number(r.cost || 0).toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-outline tabular-nums">{r.calls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
