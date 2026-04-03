

# Super Admin & Multi-Tenant Organisation Management

## Current state
- `superadmin` role exists in the enum but has no UI or logic
- One org ("Disruptors Co", type `disruptors_own`) with one `owner` membership
- Settings page has a stub invite form that doesn't actually create users
- No way to create new organisations from the UI
- No role-based UI gating anywhere

## Hierarchy model

```text
Super Admin (platform level — Disruptors Co team)
  ├── Create / manage ALL organisations
  ├── Impersonate / switch between orgs
  └── Invite org-level admins

Org Admin (scoped to their organisation)
  ├── Invite users to their org (admin, manager, analyst, client)
  ├── Create / archive projects within their org
  └── Cannot see other organisations
```

## What we'll build

### 1. Super Admin dashboard page (`/admin`)
A new top-level route (outside the project layout) visible only to `superadmin` users. Contains:
- **Organisations table**: list all orgs with name, type, member count, project count
- **Create Organisation** dialog: name + type selector → inserts into `organisations`
- **Org detail drawer**: view members, add an admin user to that org
- Navigation link in sidebar (conditionally shown for superadmin role)

### 2. Working invite flow (Settings page)
Replace the stub with a real flow using Supabase `auth.admin.inviteUserByEmail()` via an edge function:
- Edge function `invite-user`: accepts email + role + org_id, calls the Admin API to send an invite, then inserts an `org_memberships` row
- Settings page calls this function (only for admin+ roles)
- The invited user receives a magic link, signs in, and lands on the projects page for their org

### 3. Role-based UI gating
- Sidebar: show "Admin" link only for superadmin
- Settings invite section: show only for admin+ roles
- Project creation: show only for manager+ roles
- AuthContext: expose a `isSuperAdmin` boolean and a helper `hasMinRole(role)` function

### 4. Super Admin org switching
- Super Admin needs to see ALL orgs (not just their own)
- Add a security definer function `is_superadmin(uuid)` for RLS policies
- Add RLS policy on `organisations`: superadmin can SELECT all rows
- Add RLS policy on `org_memberships`: superadmin can SELECT/INSERT all rows
- In the admin dashboard, clicking an org sets it as the active context so the super admin can navigate into that org's projects

### 5. Database changes (migration)
- Create `is_superadmin()` security definer function
- Add SELECT policy on `organisations` for superadmin (all rows)
- Add SELECT + INSERT policies on `org_memberships` for superadmin
- Add INSERT policy on `org_memberships` for org admins (within their own org)

### 6. Edge function: `invite-user`
- Validates caller is admin of the target org (or superadmin)
- Uses `SUPABASE_SERVICE_ROLE_KEY` to call `auth.admin.inviteUserByEmail()`
- Creates `org_memberships` row for the invited user
- Returns success/error

## Files

- **Create**: `src/pages/AdminDashboard.tsx` — super admin org management page
- **Create**: `supabase/functions/invite-user/index.ts` — invite edge function
- **Create**: Migration — `is_superadmin()` function + RLS policies for cross-org access
- **Modify**: `src/App.tsx` — add `/admin` route
- **Modify**: `src/components/AppSidebar.tsx` — conditional admin link
- **Modify**: `src/contexts/AuthContext.tsx` — add `isSuperAdmin` and `hasMinRole()`
- **Modify**: `src/pages/Settings.tsx` — wire invite form to edge function, role-gate
- **Modify**: `src/pages/Projects.tsx` — role-gate project creation

## Security notes
- Super admin check always via server-side `is_superadmin()` function in RLS — never client-side only
- Invite edge function validates permissions using the caller's JWT + service role for admin API calls
- Org admins can only invite into their own org (enforced by RLS + edge function check)

