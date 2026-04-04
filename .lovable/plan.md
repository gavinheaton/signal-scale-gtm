

# Fix: Vault Secret Storage in manage-project-connection

## Problem
The edge function calls `vault_create_secret` and `create_secret` via Supabase `.rpc()`, which only searches the `public` schema. The actual Vault functions live in the `vault` schema (`vault.create_secret`). Both attempts fail, causing the "Failed to store secret in vault" error.

The chrome extension errors in your message are unrelated — the real issue is the 400 response from the edge function.

## Solution
Replace the `.rpc()` calls with direct SQL using the service role client, calling `vault.create_secret()` and `vault.update_secret()` in the correct schema.

## Changes

### `supabase/functions/manage-project-connection/index.ts`

**POST handler (save key):**
1. Replace the `vault_create_secret` / `create_secret` RPC calls (lines 83-118) with a raw SQL call via `serviceClient.rpc('execute_sql', ...)` — but since that's not available, use a **wrapper function** approach instead.

Actually, the simplest fix: create a thin public wrapper function that delegates to `vault.create_secret`, then call it via `.rpc()`.

**Migration:** Create two public wrapper functions:
```sql
CREATE OR REPLACE FUNCTION public.vault_create_secret(new_secret text, new_name text, new_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'vault', 'public' AS $$
DECLARE secret_id uuid;
BEGIN
  SELECT vault.create_secret(new_secret, new_name, new_description) INTO secret_id;
  RETURN secret_id;
END;$$;

CREATE OR REPLACE FUNCTION public.vault_delete_secret(secret_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'vault', 'public' AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = secret_id;
END;$$;
```

This means the existing edge function code (which already calls `public.vault_create_secret` and `public.vault_delete_secret`) will work without any changes to the edge function itself.

## Files changed
1. `supabase/migrations/XXXX_add_vault_wrapper_functions.sql` — create `public.vault_create_secret` and `public.vault_delete_secret` wrapper functions

