

# Magic Link Auth Overhaul

## Problems
1. **Broken magic link URL**: `emailRedirectTo` is hardcoded to `https://signal2scale.com.au` instead of the app's actual URL (`window.location.origin`). This means the confirmation link in the email redirects to the wrong place.
2. **No OTP code fallback**: If the link fails, users have no way to enter a verification code.
3. **Password login still present**: Needs to be removed per security preference.

## Changes

### 1. Update `src/pages/Auth.tsx` — Magic-link-only with OTP fallback
- Remove password fields, login/signup tabs, and `signInWithPassword`/`signUp` handlers
- Single-screen flow: enter email → send magic link → show OTP input
- After sending magic link, show a 6-digit OTP input (using existing `InputOTP` component) so users can paste the code from the email if the link doesn't work
- Verify OTP via `supabase.auth.verifyOtp({ email, token, type: 'email' })`
- Fix `emailRedirectTo` to use `window.location.origin` so the magic link points to the actual app
- Add "Back" button to return to email entry

### 2. Update `supabase/functions/auth-email-hook/index.ts` — Include OTP code in magic link email
- In the `magiclink` case, display both the sign-in button (with `confirmation_url`) AND the OTP token code below it
- Use `data.token` to show a 6-digit code in the email body as a fallback
- Text like: "Or enter this code manually: 123456"

### 3. Update `supabase/functions/auth-email-hook/index.ts` — Include OTP in signup email too
- Similar treatment for signup confirmation: show the link button plus OTP code

## Technical Details
- `signInWithOtp()` sends both a magic link and an OTP code by default
- `verifyOtp({ email, token, type: 'email' })` validates the 6-digit code
- The auth hook receives `token` in `email_data` which contains the OTP code
- The `InputOTP` component already exists in the project

