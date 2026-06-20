---
name: Admin hierarchy & role gating
description: Super admin dashboard, invite-user edge function, RBAC with hasMinRole helper
type: feature
---
- Super Admin (`/admin`): manages all orgs, creates new orgs, invites users to any org
- `is_superadmin()` security definer function for RLS policies
- `invite-user` edge function: validates caller role, uses service role to call `auth.admin.inviteUserByEmail()`
- AuthContext exposes `isSuperAdmin` boolean and `hasMinRole(role)` helper
- Role hierarchy: client < analyst < manager < admin < owner < superadmin
- Sidebar shows Admin link only for superadmin
- Settings invite section shown only for admin+
- Project creation gated to manager+
