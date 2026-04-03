

# Wire Up Auth Hook Secret & Deploy

## Problem
Magic link emails still come from Supabase's default sender because:
1. The `auth-email-hook` Edge Function may not be deployed yet
2. The hook secret isn't being verified in the function code (security gap)
3. The secret needs to be stored as a Supabase Edge Function secret

## Steps

### 1. Store the Hook Secret
Add the Supabase-generated hook secret as a project secret named `AUTH_HOOK_SECRET` using the `add_secret` tool.

### 2. Update `auth-email-hook` to verify the hook signature
Add signature verification at the top of the request handler to confirm payloads genuinely come from Supabase Auth. This uses the standard HMAC-SHA256 verification pattern Supabase uses for hooks.

**File:** `supabase/functions/auth-email-hook/index.ts`
- Import crypto utilities
- Read `AUTH_HOOK_SECRET` from environment
- Verify the `x-supabase-signature` header against the request body
- Reject requests with invalid signatures (401)

### 3. Deploy the Edge Function
Deploy `auth-email-hook` with `--no-verify-jwt` (required since Supabase Auth hooks don't send a standard JWT).

### 4. Test
Trigger a magic link to `gavin@disruptorsco.com` via curl to confirm the branded email arrives from `admin@signal2scale.com.au` via Brevo.

## Technical Detail
- Supabase Auth hooks sign the POST body with HMAC-SHA256 using the hook secret
- The signature is sent in the `x-supabase-signature` header
- The Edge Function must verify this before processing the payload

