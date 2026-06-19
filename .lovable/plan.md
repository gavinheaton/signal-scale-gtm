# Inline search results + delete organisations

## Changes in `src/components/discovery/OrganizationsTab.tsx`

### 1. Move "Find organisations" inline (remove Sheet)
- Replace `FindOrgsSheet` with an inline `SearchPanel` rendered above the org table when active.
- "Find organisations" button now toggles the panel open/closed (panel sits between the action row and the org table).
- Panel contains: description, "Run search" button, loading state, results list with checkboxes (current candidate UI), an inline diagnostics block when zero results (replaces the toast — shows raw/filtered counts, AI note, sample dropped titles), and Add/Cancel actions.
- On save: insert selected candidates, refresh org list, keep panel open with success message ("Added N — run another search or close") plus a Close button. Toast only on errors.

### 2. Inline diagnostics (no more toast for empty results)
- When `data.debug` is present, render a small muted card inside the panel listing:
  - Query variants tried
  - Raw hits returned by Firecrawl
  - Hits that looked like company sites
  - AI note (if any)
  - Sample dropped titles + reasons
- Includes a hint to broaden segment or qualifying signals.

### 3. Delete existing organisations
- Add a trailing actions cell to the org table with a trash-icon `Button` next to "Find roles".
- Click → `AlertDialog` confirm ("Delete {org.name}? This removes its roles, contacts, and conversations.") → on confirm, delete in order: `discovery_conversations` for the org's contacts, `discovery_contacts`, `discovery_org_roles`, then `discovery_organizations` row — all scoped by `organization_id`/`id`. Then `refresh()` and toast success/error.
- Use `AlertDialog` from `@/components/ui/alert-dialog` and `Trash2` icon from `lucide-react`.

## Out of scope
- No edge function changes.
- No schema changes (existing RLS on discovery_* tables already allows project members to delete).
- `AddOrgSheet` and `FindRolesSheet` unchanged.
