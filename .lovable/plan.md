

# Fix Auth Email: Construct Confirmation URL + Show OTP Code

## Root Cause

Supabase Auth **Send Email hooks** do NOT provide `confirmation_url` in the payload. They provide:
- `token_hash` — used to construct the verification URL
- `token` — the 6-digit OTP code
- `redirect_to` — where to redirect after verification

The current code does `const confirmationUrl = data.confirmation_url || ""` which resolves to empty string, so the button link is blank and the OTP code conditional also fails if `token` isn't being passed through correctly.

## Fix in `supabase/functions/auth-email-hook/index.ts`

### 1. Construct the confirmation URL manually

Replace the `confirmationUrl` assignment with:

```typescript
const SUPABASE_URL = "https://xiufgczyecwgnkbyroow.supabase.co";

const confirmationUrl = data.confirmation_url ||
  (data.token_hash
    ? `${SUPABASE_URL}/auth/v1/verify?token=${data.token_hash}&type=${emailType}&redirect_to=${encodeURIComponent(data.redirect_to || '')}`
    : "");
```

This builds the proper Supabase Auth verification URL from `token_hash`, `type`, and `redirect_to`.

### 2. Add logging to debug payload

Add a `console.log` of the received `email_data` fields (token, token_hash, redirect_to, confirmation_url) so you can verify what Supabase is actually sending. This helps confirm the OTP code is present.

### 3. Ensure OTP display works

The existing template code already conditionally shows `data.token` — once the URL is fixed and we confirm `token` is populated, the OTP code should appear. If Supabase doesn't send `token` for magic links, we may need to display `token_hash` or adjust the Supabase Auth settings to enable OTP codes alongside magic links.

## After Updating

You'll need to redeploy:
```
supabase functions deploy auth-email-hook --no-verify-jwt --project-ref xiufgczyecwgnkbyroow
```

Then test again by triggering a magic link to verify both the clickable link and OTP code appear in the email.

