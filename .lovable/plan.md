

# Update Auth Redirect URLs to Custom Domain

## What's changing
Update the email redirect URLs in the authentication flow from `https://signal-scale-gtm.lovable.app` to `https://signal2scale.com.au`.

## Changes

**File: `src/pages/Auth.tsx`**
- Line 35: Change `emailRedirectTo` from `'https://signal-scale-gtm.lovable.app'` to `'https://signal2scale.com.au'`
- Line 47: Same change for the magic link flow

## Required manual step
In your **Supabase Dashboard → Authentication → URL Configuration**:
- Set **Site URL** to `https://signal2scale.com.au`
- Add `https://signal2scale.com.au` to **Redirect URLs** allowlist
- Keep `https://signal-scale-gtm.lovable.app` in the allowlist as a fallback

