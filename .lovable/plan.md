## Super Admin — User Management

Add a Users section to the existing `/admin` page (below Organisations) that lets you see every user in the system and manage their access.

### What you'll be able to do

- See every user across all orgs in one table: email, org(s) + role in each, last sign-in, created date, superadmin badge.
- Search/filter by email or org.
- Open a user → side drawer with full detail and actions:
  - Change their role in any org (client / analyst / manager / admin / owner).
  - Remove them from an org.
  - Add them to another org with a chosen role.
  - Promote to superadmin / demote (with confirm — can't demote yourself).
  - Send password reset email.
  - Resend invite (magic link) for users who never signed in.
  - Delete the user entirely (hard delete via Supabase Admin API, with a typed-confirmation guard — cascades all memberships).

### Where it lives

New "Users" card on the existing Super Admin page (`src/pages/AdminDashboard.tsx`), directly under the Organisations card. No new route.

---

### Technical details

**New edge function `admin-users`** (single function, action-based to keep it simple) — requires caller to be superadmin, uses service role internally:

- `list` — returns all `auth.users` joined with their `org_memberships` + org names, plus last_sign_in_at.
- `update_membership` — change role on an existing `org_memberships` row.
- `remove_membership` — delete an `org_memberships` row.
- `add_membership` — insert an `org_memberships` row for an existing user (no email sent).
- `set_superadmin` — insert/remove a `superadmin` membership row (attached to a system org; see note below).
- `reset_password` — calls `auth.admin.generateLink({ type: 'recovery' })` and sends via existing email flow, OR uses `resetPasswordForEmail`.
- `resend_invite` — calls `auth.admin.inviteUserByEmail` again.
- `delete_user` — calls `auth.admin.deleteUser` (RLS-cascading FKs already drop memberships).

All actions validate `is_superadmin(auth.uid())` before proceeding and refuse self-demotion / self-delete.

**Superadmin storage note:** today `superadmin` is a role on an `org_memberships` row. Promoting a user requires an `org_id`. The plan attaches the superadmin membership to the user's first existing org membership, or errors with a clear message if they belong to none (asking you to add them to an org first). No schema change.

**Frontend changes:**
- `src/pages/AdminDashboard.tsx` — new `<UsersCard />` section + user detail Sheet.
- `src/components/admin/UsersCard.tsx` (new) — table, search, row → open drawer.
- `src/components/admin/UserDetailDrawer.tsx` (new) — memberships list with inline role Select + Remove, "Add to org" form (org Select + role Select), action buttons (Reset password, Resend invite, Promote/Demote superadmin, Delete user with typed confirm).

**Files touched:**
- Create `supabase/functions/admin-users/index.ts`
- Create `src/components/admin/UsersCard.tsx`
- Create `src/components/admin/UserDetailDrawer.tsx`
- Edit `src/pages/AdminDashboard.tsx` (mount `<UsersCard />`)

No database migration needed — everything runs against existing tables and Supabase Auth admin APIs.
