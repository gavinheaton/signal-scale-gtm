## How to create a new organisation today

Only superadmins can create orgs. From the sidebar, superadmins open **Admin** → click **New Organisation** in the header of the Organisations card. This behaviour stays as-is.

For everyone else, orgs are provisioned by a superadmin and users are added via **Admin → Users** or the org's invite form.

## Multi-org project creation

Right now `AuthContext` loads only the *first* `org_memberships` row for a user, so a user who belongs to multiple orgs only ever sees one. The Projects page filters by that single `org_id`, and the New Project dialog silently inserts into it.

Changes (frontend only — RLS already permits inserts for manager+ in any org the user belongs to):

### 1. `src/contexts/AuthContext.tsx`
- Fetch **all** rows from `org_memberships` for the user, plus the matching organisations in one follow-up query.
- Expose `memberships: OrgMembership[]` and `organisations: Organisation[]` alongside the existing `membership` / `organisation` (kept as the "active" one, initialised to the first row, persisted in `localStorage` under `activeOrgId`).
- Add `setActiveOrg(orgId)` and update `hasMinRole` / `isSuperAdmin` to read from the active membership.

### 2. `src/pages/Projects.tsx`
- Query projects with `.in('org_id', memberships.map(m => m.org_id))` instead of a single `eq`.
- Add an **Organisation filter** (Select) at the top when the user belongs to >1 org — options: "All organisations" + one per org. Default: All.
- On each project card, show a small org badge when >1 org is visible.
- **New Project dialog:** when the user has >1 org, add an "Organisation" Select (options limited to orgs where the user is manager+). Default to the active org / currently filtered org. Insert uses the selected `org_id`. When only one qualifying org exists, hide the selector (current behaviour).
- Compute `canCreateProject` per-org (some memberships may be `analyst`/`client`); disable the button only if none of the user's orgs allow it.

### 3. Sidebar org switcher (small quality-of-life)
- `src/components/AppSidebar.tsx`: if `memberships.length > 1`, render the current org name as a dropdown that calls `setActiveOrg`. Otherwise unchanged.

### Files
- Edit: `src/contexts/AuthContext.tsx`, `src/pages/Projects.tsx`, `src/components/AppSidebar.tsx`
- No DB changes, no edge functions.
