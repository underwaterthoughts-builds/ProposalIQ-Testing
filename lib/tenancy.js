// Multi-tenant scope helpers (Wave 6 Phase 2).
//
// Every API route that reads/writes a tenant-scoped table must apply a
// filter so users only see their own rows. Admin bypasses the filter —
// they see everything. Impersonation does NOT bypass: when admin is
// "viewing as" a member, they see only that member's data (that's the
// whole point of view-as).
//
// Usage for reads:
//   const { clause, params } = scope(req.user);
//   const rows = db.prepare(`SELECT * FROM projects WHERE 1=1 ${clause}`).all(...params);
//
// Usage for writes (stamp on INSERT):
//   const owner = ownerId(req.user);
//   db.prepare(`INSERT INTO projects (id, name, owner_user_id) VALUES (?, ?, ?)`).run(id, name, owner);
//
// Usage for ownership check (UPDATE/DELETE on a specific row):
//   if (!canAccess(req.user, row)) return res.status(404).json({ error: 'Not found' });

// Returns the WHERE fragment (with leading AND) + params to append.
// For admin: empty clause + empty params.
// For everyone else: `AND owner_user_id = ?` with the user's id.
//
// column lets callers target a non-default column name (e.g. scan_id
// joined tables where the owner lives in a parent row — use the joined
// alias). Default is "owner_user_id".
function scope(user, column = 'owner_user_id') {
  if (!user) return { clause: '', params: [] };
  if (isAdmin(user)) return { clause: '', params: [] };
  return { clause: ` AND ${column} = ?`, params: [user.id] };
}

// Owner id to stamp on newly-created rows. Admin-created rows are still
// owned by the admin (not shared), which matches the "admin sees everything"
// model: admin sees their own + everyone else's, members see only their own.
function ownerId(user) {
  return user?.id || null;
}

// True if this user can see/modify the given row. Use after SELECT by id
// to enforce tenant boundary: admin always true; member only if owner matches.
function canAccess(user, row, column = 'owner_user_id') {
  if (!user || !row) return false;
  if (isAdmin(user)) return true;
  return row[column] === user.id;
}

// Admin check — uses impersonator's role if present so view-as sessions
// act as the target user, never promote through them.
function isAdmin(user) {
  if (!user) return false;
  // When impersonating, the real admin wants to walk in the target user's
  // shoes — so we treat them as a member for data scoping even though they
  // keep admin privileges for admin-only routes (see requireAdmin in auth).
  if (user._impersonator) return false;
  return user.role === 'admin';
}

module.exports = { scope, ownerId, canAccess, isAdmin };
