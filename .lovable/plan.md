

# Connections Card — Per-Project API Keys for Claude & Notion

## What we're building
A "Connections" card on the Settings page where admins can configure API keys (Claude, Notion) per project. Keys are stored in a new `project_connections` table with values encrypted via Supabase Vault's `pgsodium` extension.

## Database

### New table: `project_connections`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| project_id | uuid NOT NULL | references projects |
| provider | text NOT NULL | 'claude' or 'notion' |
| api_key_secret_id | uuid NOT NULL | references pgsodium.decrypted_secrets or vault.secrets |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |
| UNIQUE(project_id, provider) | | one key per provider per project |

### Vault approach
Use `vault.create_secret(key_value, name, description)` to store the actual API key in Supabase Vault. Store the returned secret ID in `project_connections.api_key_secret_id`. A security definer function `get_project_connection_key(project_id, provider)` retrieves the decrypted value — only callable by users with org access to the project.

### RLS on `project_connections`
- SELECT/INSERT/UPDATE: user has org access to the project (same pattern as other tables)
- Superadmins can manage all

## Edge function: `manage-project-connection`
Handles save/delete of connection keys since Vault operations need service role:
- **POST**: accepts `{ project_id, provider, api_key }` — stores key in vault, upserts `project_connections`
- **DELETE**: accepts `{ project_id, provider }` — removes vault secret + row
- Validates caller has admin+ role for the project's org

## UI Changes

### Settings page (`src/pages/Settings.tsx`)
Add a **Connections** card (visible to admin+ roles) below the Invite User card:
- Shows the current project's connections (Claude, Notion)
- Each row: provider icon/name, status indicator (connected/not configured), and a configure button
- Configure opens an inline form or dialog with a masked API key input field
- Save button calls the edge function
- Delete/disconnect button to remove a key

### Types
Add `ProjectConnection` interface to `src/types/database.ts`.

## Files
- **Create**: Migration — `project_connections` table, vault functions, RLS policies
- **Create**: `supabase/functions/manage-project-connection/index.ts` — edge function for key management
- **Modify**: `src/pages/Settings.tsx` — add Connections card with provider rows
- **Modify**: `src/types/database.ts` — add `ProjectConnection` type

## Security
- Raw API keys never stored in plain text — always via Supabase Vault
- Keys only decrypted server-side in edge functions that need them (wizard functions)
- Client never receives decrypted keys — only sees "configured" / "not configured" status
- Edge function validates caller permissions before any vault operation

