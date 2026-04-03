

# Fix Auth Email Hook & Update Sender

## Changes

### 1. Update sender email in `send-transactional-email`
**File: `supabase/functions/send-transactional-email/index.ts`**
- Change `SENDER_EMAIL` from `noreply@signal2scale.com.au` to `admin@signal2scale.com.au`

### 2. Fix auth-email-hook response to match Supabase Auth Hook schema
**File: `supabase/functions/auth-email-hook/index.ts`**

Supabase Auth Hooks (specifically the "Send Email" hook using the Postgres function schema) expect the Edge Function to return a JSON response in this specific format:

```json
{
  "email": {
    "subject": "...",
    "body": "..."
  }
}
```

However, since we're sending the email ourselves via Brevo (not letting Supabase send it), the hook must signal that Supabase should NOT also send its default email. The correct response format for a "Send Email" hook that handles delivery itself is:

```json
{}
```

...returned with status 200. This tells Supabase the hook handled the email successfully and no further action is needed.

Current code returns `{ "success": true }` which doesn't match the expected schema and may cause Supabase to reject the hook response or double-send.

**Fix:** Change the success response to return an empty JSON object `{}`.

Also update `SENDER_EMAIL` to `admin@signal2scale.com.au` here as well for consistency (the auth emails will also come from this address).

### 3. Redeploy both Edge Functions
After changes, both functions need redeployment:
- `auth-email-hook` (with `--no-verify-jwt`)
- `send-transactional-email`

## Technical details
- Supabase Auth Hook "Send Email" expects either an empty response body or a specific schema — returning arbitrary JSON like `{ success: true }` can cause hook failures
- Both functions will use `admin@signal2scale.com.au` as the sender — ensure this address is verified in your Brevo dashboard

