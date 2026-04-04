

# Add API Key Management + Brand Voice Sync Endpoint

## Overview
Three pieces: a new `api_keys` table, an API Access section in Settings, and a `get-brand-voices` edge function for Cowork to pull completed brand voices via API key auth.

## 1. Database Migration

Create `api_keys` table with RLS:

```sql
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  key_hash text not null unique,
  key_prefix text not null,
  label text default 'Cowork Sync',
  created_at timestamptz default now(),
  last_used_at timestamptz
);

alter table public.api_keys enable row level security;

create policy "Users can view own keys"
  on public.api_keys for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own keys"
  on public.api_keys for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own keys"
  on public.api_keys for delete to authenticated
  using (user_id = auth.uid());
```

Note: `user_id` references `auth.users(id)` conceptually but we avoid FK to auth schema per project conventions. RLS scopes all access to the owning user.

## 2. Settings Page — API Access Section

Add to `src/pages/Settings.tsx` after the Connections card:

- New card: "API Access" with Key icon
- "Generate API Key" button:
  - Client generates 32-char random hex prefixed `gtm_`
  - Hashes with SHA-256 via Web Crypto API
  - Inserts `{ user_id, key_hash, key_prefix: key.slice(0,12) }` into `api_keys`
  - Shows modal with full key + copy button + "Copy this key now — it won't be shown again."
- Below: table of existing keys showing prefix, label, created date, last used date, revoke button
- Available to all authenticated users (not role-gated)

## 3. Edge Function: `get-brand-voices`

Create `supabase/functions/get-brand-voices/index.ts`:

- Method: GET only
- Auth: `Authorization: Bearer gtm_xxxxx` — no JWT
- Flow:
  1. Extract key from header
  2. SHA-256 hash it
  3. Look up hash in `api_keys` using service role client — if not found, return 401
  4. Update `last_used_at`
  5. Get `user_id` from matched row
  6. Query `brand_voices` where `status = 'complete'` joined with `projects` where project's `org_id` matches user's org (via `org_memberships`)
  7. Return JSON with `brand_voices` array containing `schema_version`, `project_slug`, `project_name`, `generated_at`, `generated_by`, and full `brand_voice` object
- CORS headers included
- Add to `supabase/config.toml` with `verify_jwt = false`

## 4. Secret

Store `GTM_PLATFORM_URL` = `https://xiufgczyecwgnkbyroow.supabase.co/functions/v1/get-brand-voices` as a Supabase secret.

## Files Changed

1. **Migration** — new `api_keys` table + RLS policies
2. `supabase/functions/get-brand-voices/index.ts` — new edge function
3. `supabase/config.toml` — add `get-brand-voices` function config
4. `src/pages/Settings.tsx` — add API Access card with key generation, list, and revoke
5. `src/types/database.ts` — add `ApiKey` interface

