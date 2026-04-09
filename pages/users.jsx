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
      <div className="p-12 text-center" style={{ color: '#6b6456' }}>Only admins can manage users.</div>
    </Layout>
  );

  return (
    <>
      <Head><title>Users — ProposalIQ</title></Head>
      <Layout title="Users" subtitle="Manage who has access" user={user}
        actions={<Btn variant="teal" onClick={() => setShowInvite(true)}>⊕ Add User</Btn>}>
        <div className="h-full overflow-y-auto p-6" style={{ background: '#faf7f2' }}>
          <div className="max-w-2xl mx-auto">
            <Card>
              {loading ? (
                <div className="p-8 flex items-center justify-center gap-2 text-sm" style={{ color: '#6b6456' }}>
                  <Spinner /> Loading…
                </div>
              ) : users.map((u, i) => (
                <div key={u.id} className={`flex items-center gap-4 p-4 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: '#f0ebe0' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: u.role === 'admin' ? '#b8962e' : '#1e4a52' }}>
                    {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{u.name}</span>
                      {u.role === 'admin' && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#faf4e2', color: '#b8962e' }}>admin</span>}
                      {u.id === user.id && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#f0ebe0', color: '#6b6456' }}>you</span>}
                    </div>
                    <div className="text-xs" style={{ color: '#6b6456' }}>{u.email}</div>
                  </div>
                  {u.id !== user.id && (
                    <Btn variant="danger" size="sm" onClick={() => removeUser(u.id, u.name)}>Remove</Btn>
                  )}
                </div>
              ))}
            </Card>

            {showInvite && (
              <Card className="mt-4 p-5">
                <h3 className="font-serif text-base mb-4">Add a New User</h3>
                <div className="space-y-3">
                  <Input label="Full Name" value={invite.name} onChange={e => setInvite(p => ({ ...p, name: e.target.value }))} placeholder="Sarah Chen" />
                  <Input label="Email" type="email" value={invite.email} onChange={e => setInvite(p => ({ ...p, email: e.target.value }))} placeholder="sarah@company.com" />
                  <Input label="Temporary Password" type="text" value={invite.password} onChange={e => setInvite(p => ({ ...p, password: e.target.value }))} placeholder="They can change this after logging in" hint="At least 8 characters — share this with them directly" />
                  <div className="flex gap-3 pt-2">
                    <Btn variant="teal" onClick={sendInvite} disabled={saving}>
                      {saving ? <><Spinner size={12} /> Adding…</> : 'Add User'}
                    </Btn>
                    <Btn variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Btn>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />
    </>
  );
}
