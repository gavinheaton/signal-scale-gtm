## Per-project Notion connection (Vault-backed)

Mirror the ProPresence/WordPress/Claude pattern so each project stores its own Notion integration token in Supabase Vault. Edge functions resolve the key by `project_id` instead of using the global `NOTION_API_KEY` env var.

### 1. Schema
Migration adds to `projects`:
- `notion_api_key_secret_id uuid` — Vault secret reference
- `notion_workspace_name text` — display label (optional, set on connect)
- `notion_connected_at timestamptz`

No new tables. Existing `notion_calendar_db_id`, `notion_pillars_db_id`, `notion_foundations_db_id`, `notion_last_synced_at` stay as-is.

### 2. New edge function: `manage-notion-connection`
Modeled on `manage-propresence-connection`. Actions:
- `connect { project_id, api_key }` — verifies caller is admin+ on the project's org, validates the key by calling `GET https://api.notion.com/v1/users/me`, stores via `vault_create_secret`, writes `notion_api_key_secret_id` + `notion_workspace_name` + `notion_connected_at`, **clears** `notion_calendar_db_id`/`notion_pillars_db_id`/`notion_foundations_db_id` so the next Setup rebuilds in the new workspace.
- `disconnect { project_id }` — admin+, calls `vault_delete_secret`, nulls all notion_* columns on the project.
- `status { project_id }` — returns `{ connected, workspace_name, connected_at, has_databases }`.

### 3. Refactor existing Notion edge functions
Replace every `Deno.env.get("NOTION_API_KEY")` with a shared `resolveNotionKey(projectId)` helper (new `supabase/functions/_shared/notion.ts`) that reads `projects.notion_api_key_secret_id` and pulls the plaintext from Vault. Functions touched:
- `setup-notion-workspace`
- `push-asset-to-notion`
- `bulk-push-campaign-to-notion`
- `add-campaign-to-notion`
- `create-notion-campaign-brief`
- `check-notion-sync`

If a project has no Notion key configured, return a clear 400: "Connect Notion for this project in Settings first."

### 4. Settings UI
New `NotionConnectionCard.tsx` (copy of `PropresenceConnectionCard.tsx` styling) shown per active project:
- Disconnected state: input for Notion internal integration token, "Connect" button, helper link explaining how to create one at notion.so/profile/integrations and share target pages with the integration.
- Connected state: workspace name, connected timestamp, "Setup Notion Workspace" button (existing flow), "Disconnect" button.

Mount in `Settings.tsx` next to the ProPresence card.

### 5. Clean up stale workspace IDs
The migration also sets `notion_calendar_db_id`, `notion_pillars_db_id`, `notion_foundations_db_id`, `notion_last_synced_at` to NULL for the user's current project (so the wrong-workspace IDs from the earlier Notion run are wiped). User then connects the ProPresence-workspace token and re-runs Setup.

### 6. Global `NOTION_API_KEY` secret
Leave it in place for now (no code reads it after the refactor). Can be deleted later from Settings → Secrets once the refactor is verified.

### Technical notes
- Vault helpers `vault_create_secret` / `vault_delete_secret` already exist (used by ProPresence and WordPress).
- Secret name convention: `notion_api_key_{project_id}` to match ProPresence pattern.
- Auth: every action checks `user_has_org_role(auth.uid(), project.org_id, ARRAY['admin','owner','superadmin'])`.
- No changes to `types.ts` by hand — regenerated after migration.

### Files
**New**
- `supabase/migrations/<timestamp>_notion_per_project.sql`
- `supabase/functions/manage-notion-connection/index.ts`
- `supabase/functions/_shared/notion.ts`
- `src/components/settings/NotionConnectionCard.tsx`

**Modified**
- 6 Notion edge functions (key resolution)
- `src/pages/Settings.tsx` (mount card)
