

# Archive & Delete Projects for Admins

## What It Does

Adds two project management actions for admin+ users on the `/projects` page:

- **Archive**: Soft-deletes a project by changing its status to `archived`. Archived projects are hidden from the default view but can be restored.
- **Permanently Delete**: Hard-deletes a project and all associated data (ICPs, personas, campaigns, assets, metrics, wizard sessions, connections) via a cascading database function.

An "Archived" toggle/tab lets admins view and restore archived projects.

## Database Changes

1. **Add `archived` to `project_status` enum**:
   ```sql
   ALTER TYPE project_status ADD VALUE 'archived';
   ```

2. **Create a `delete_project_cascade` security definer function** that deletes all child records then the project itself. This runs as the function owner (bypasses RLS) so we don't need DELETE policies on every child table:
   ```sql
   CREATE OR REPLACE FUNCTION delete_project_cascade(_project_id uuid)
   RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
   BEGIN
     -- Verify caller is admin/owner/superadmin for the project's org
     IF NOT EXISTS (
       SELECT 1 FROM projects p
       JOIN org_memberships om ON om.org_id = p.org_id
       WHERE p.id = _project_id AND om.user_id = auth.uid()
         AND om.role IN ('admin','owner','superadmin')
     ) THEN
       RAISE EXCEPTION 'Unauthorized';
     END IF;
     -- Delete children
     DELETE FROM campaign_metrics WHERE campaign_id IN (SELECT id FROM campaigns WHERE project_id = _project_id);
     DELETE FROM campaign_assets WHERE campaign_id IN (SELECT id FROM campaigns WHERE project_id = _project_id);
     DELETE FROM campaigns WHERE project_id = _project_id;
     DELETE FROM personas WHERE project_id = _project_id;
     DELETE FROM icps WHERE project_id = _project_id;
     DELETE FROM wizard_sessions WHERE project_id = _project_id;
     DELETE FROM project_connections WHERE project_id = _project_id;
     DELETE FROM projects WHERE id = _project_id;
   END;
   $$;
   ```

3. **Add DELETE policy on projects** for admin+ users (needed for the archive/restore UPDATE, which already has a policy).

## TypeScript Changes

- **`src/types/database.ts`**: Add `'archived'` to `ProjectStatus`.

## UI Changes (`src/pages/Projects.tsx`)

- Filter default project list to exclude `archived` status.
- Add a "Show archived" toggle (visible to admin+) that reveals archived projects with a muted style.
- Each project card gets a `...` dropdown menu (admin+ only) with:
  - **Archive** — sets status to `archived`, with confirmation.
  - **Restore** (on archived cards) — sets status back to `setup`.
  - **Delete permanently** — calls `delete_project_cascade` RPC, with a destructive confirmation dialog requiring the user to type the project name.
- Add `archived` to the `statusColors` map with a grey style.

## Files to Change

| File | Change |
|------|--------|
| Migration SQL | Add enum value, create `delete_project_cascade` function |
| `src/types/database.ts` | Add `'archived'` to `ProjectStatus` |
| `src/pages/Projects.tsx` | Add dropdown menu, archive/restore/delete actions, archived toggle |

