

# Test Send Transactional Email via Script

## Approach
Run a `curl` command directly to invoke the `send-transactional-email` Edge Function — no UI changes needed.

## Steps

### 1. Fetch available secrets
Check that `BREVO_API_KEY` is configured.

### 2. Run curl to invoke the Edge Function
Call the deployed function at `https://xiufgczyecwgnkbyroow.supabase.co/functions/v1/send-transactional-email` with:
- **To:** `gavin@disruptorsco.com`
- **Subject:** "Test Email from Signal + Scale"
- **HTML:** Branded test email with Signal + Scale styling
- Auth header using the Supabase anon key (the function requires JWT, so we'll need to sign in first to get a valid token, or invoke it with the service role key)

### 3. Check response
Verify success or diagnose any errors from the response.

## Important prerequisite
The Edge Function must already be deployed to Supabase. If it returns 404, it needs deployment first (`supabase functions deploy send-transactional-email`).

## Technical note
Since the function validates JWT auth, I'll need to either:
- Use the Supabase service role key to bypass JWT check, or
- Create a quick auth session to get a bearer token

I'll check what's available via secrets first.

