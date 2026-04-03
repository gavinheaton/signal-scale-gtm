

# Fix Magic Link Rate Limit Issue

## Problem
Supabase Auth enforces a rate limit on `signInWithOtp` (default: 1 email per 60 seconds per address). This fires before the Brevo hook is called, so clicking "Send Magic Link" or "Resend code" too quickly triggers "email rate exceeded" — regardless of Brevo.

## Changes

### 1. Add cooldown timer to Auth page (`src/pages/Auth.tsx`)
- After sending the magic link, start a 60-second countdown
- Disable both the "Send Magic Link" button (if user goes back) and "Resend code" button during cooldown
- Show remaining seconds on the resend button: "Resend code (45s)"
- Use `useState` for countdown + `useEffect` with `setInterval`

### 2. Optional: Supabase dashboard setting
- In Supabase Dashboard → Authentication → Rate Limits, you can adjust `RATE_LIMIT_EMAIL_SENT` if 60s is too long
- This is a manual step — no code change needed

