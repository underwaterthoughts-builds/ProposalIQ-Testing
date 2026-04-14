import { useEffect, useState } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { Card, Btn, Input, Spinner, Toast } from '../components/ui';
import { useUser } from '../lib/useUser';

export default function Users() {
  const { user, loading: authLoading } = useUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  async function loadUsers() {
    try {
      const r = await fetch('/api/users');
      const d = await r.json();
      setUsers(d.users || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { if (user) loadUsers(); }, [user]);

  if (authLoading) return null;
  if (!user) return null;

  async function removeUser(id, name) {
    if (!confirm(`Remove ${name}? They will no longer be able to log in.`)) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    loadUsers();
    setToast(`${name} removed`);
  }

  async function sendInvite() {
    if (!invite.name || !invite.email || !invite.password) { setToast('All fields required'); return; }
    setSaving(true);
    const r = await fetch('/api/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invite),
    });
    const d = await r.json();
    if (r.ok) {
      setToast(`${invite.name} added — share their email and password with them`);
      setInvite({ name: '', email: '', password: '' });
      setShowInvite(false);
      loadUsers();
    } else {
      setToast(d.error || 'Failed to add user');
    }
    setSaving(false);
  }

  if (user.role !== 'admin') return (
    <Layout title="Users" user={user}>
      <div className="min-h-screen bg-surface pt-24 text-center">
        <p className="font-body text-on-surface-variant">Only admins can manage users.</p>
      </div>
    </Layout>
  );

  return (
    <>
      <Head><title>Users — ProposalIQ</title></Head>
      <Layout title="Users" user={user}>
        <main className="min-h-screen pb-24 flex flex-col items-center relative overflow-hidden bg-surface">

          {/* Geometric accent background */}
          <div className="absolute inset-0 pointer-events-none opacity-20 z-0">
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary-container rounded-full blur-[120px]" />
            <div className="absolute top-1/2 -right-48 w-[500px] h-[500px] bg-secondary-container rounded-full blur-[160px]" />
          </div>

          <div className="w-full max-w-[640px] px-6 py-12 relative z-10">

            {/* Editorial header */}
            <header className="mb-16">
              <div className="inline-block py-1 px-3 bg-surface-container-high text-primary font-label text-[10px] uppercase tracking-[0.2em] mb-4">
                Access Management
              </div>
              <h1 className="font-headline text-5xl md:text-6xl text-on-surface tracking-tighter font-light leading-[0.9]">
                System <span className="italic font-serif">Users</span>
              </h1>
              <p className="mt-6 text-on-surface-variant font-body text-lg leading-relaxed max-w-[480px]">
                Manage credentials and workspace permissions for your intelligence collective.
              </p>
            </header>

            {/* Provision form */}
            {showInvite && (
              <section className="bg-surface-container-lowest p-8 md:p-10 mb-12 shadow-2xl border border-outline-variant/10">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="font-label text-xs uppercase tracking-widest text-primary">Provision New Account</h2>
                  <button
                    onClick={() => setShowInvite(false)}
                    className="text-on-surface-variant hover:text-primary transition-colors"
                    aria-label="Close"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <form onSubmit={e => { e.preventDefault(); sendInvite(); }} className="space-y-8">
                  <FloatField
                    id="full_name"
                    label="Full Name"
                    value={invite.name}
                    onChange={v => setInvite(p => ({ ...p, name: v }))}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FloatField
                      id="email_addr"
                      label="Email Address"
                      type="email"
                      value={invite.email}
                      onChange={v => setInvite(p => ({ ...p, email: v }))}
                    />
                    <FloatField
                      id="pass_key"
                      label="Initial Password"
                      type="password"
                      value={invite.password}
                      onChange={v => setInvite(p => ({ ...p, password: v }))}
                    />
                  </div>
                  <div className="pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-primary text-on-primary font-label text-xs uppercase tracking-widest px-8 py-3 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {saving ? 'Adding…' : 'Add User'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* User list */}
            <section>
              <div className="flex items-center justify-between mb-8">
                <h2 className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                  Active Directory ({String(users.length).padStart(2, '0')})
                </h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="font-label text-[10px] text-on-surface-variant uppercase">Encrypted Connection</span>
                  </div>
                  {!showInvite && (
                    <button
                      onClick={() => setShowInvite(true)}
                      className="bg-primary text-on-primary font-label text-[10px] uppercase tracking-widest px-4 py-2 hover:brightness-110 transition-all"
                    >
                      + Add User
                    </button>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-on-surface-variant">
                  <Spinner /> Loading directory…
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-16">
                  <span className="material-symbols-outlined text-5xl text-outline opacity-40">group</span>
                  <p className="font-body text-on-surface-variant mt-4">No users yet. Provision the first account above.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map(u => {
                    const initials = u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                    const isSelf = u.id === user.id;
                    const isAdmin = u.role === 'admin';
                    return (
                      <div
                        key={u.id}
                        className="group flex items-center justify-between p-4 bg-surface-container-low hover:bg-surface-container-high transition-colors"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="relative flex-shrink-0">
                            <div className="w-12 h-12 bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center text-primary font-label text-sm rounded-sm">
                              {initials}
                            </div>
                            <div className={`absolute -bottom-1 -right-1 w-3 h-3 border-2 border-surface-container-low rounded-full ${isAdmin ? 'bg-primary' : 'bg-outline-variant'}`} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-headline text-lg text-on-surface truncate">
                              {u.name}
                              {isSelf && (
                                <span className="ml-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60 align-middle">
                                  you
                                </span>
                              )}
                            </h3>
                            <p className="font-body text-xs text-on-surface-variant truncate">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span
                            className={`font-label text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                              isAdmin ? 'text-primary border-primary/20' : 'text-on-surface-variant border-outline-variant/30'
                            }`}
                          >
                            {isAdmin ? 'Admin' : 'Member'}
                          </span>
                          {!isSelf && (
                            <button
                              onClick={() => removeUser(u.id, u.name)}
                              className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </main>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />
    </>
  );
}

// Floating-label form field — minimalist input per Sovereign Editorial design
function FloatField({ id, label, value, onChange, type = 'text' }) {
  return (
    <div className="relative group">
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder=" "
        className="peer w-full bg-transparent border-0 border-b border-outline-variant py-3 px-0 focus:ring-0 focus:outline-none focus:border-primary transition-all placeholder-transparent text-on-surface"
      />
      <label
        htmlFor={id}
        className="absolute left-0 top-3 text-on-surface-variant font-body text-sm pointer-events-none transition-all peer-focus:-top-4 peer-focus:text-[10px] peer-focus:text-primary peer-focus:uppercase peer-focus:tracking-widest peer-[:not(:placeholder-shown)]:-top-4 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-widest"
      >
        {label}
      </label>
    </div>
  );
}
