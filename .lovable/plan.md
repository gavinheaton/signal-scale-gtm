
# Login Recovery Plan

I checked the code, auth logs, and database state. The key finding is: your data is there and Supabase login is already succeeding, so the current blocker is the app flow, not the database.

## What I found

- Supabase shows a successful login event for your user.
- Your user already has an `org_memberships` row.
- There is already a project in that org.
- So the app should be able to land on `/projects`, but the client-side auth/org loading flow is fragile.

## Root causes

1. `AuthContext` sets `loading = false` before org membership and organisation lookup are finished.
2. `Projects.tsx` waits for `membership`, but if that value is delayed or fails once, the page can sit in a spinner state and feel like login failed.
3. The auth screen currently mixes two login modes:
   - magic link email
   - 6-digit OTP entry  
   But the actual emails are currently being sent by Supabase SMTP, so the UI and email behavior are out of sync.

## Focused fix plan

### 1. Stop the churn and prioritize one working login path
For now, I would simplify auth to **magic-link only** so you can log in reliably first.

- Remove the OTP/code entry UI from `Auth.tsx`
- Keep the resend cooldown
- Update copy so it clearly says “check your email and click the link”

This is the fastest path to a working system.

### 2. Fix auth readiness in `AuthContext`
Refactor auth state so the app only considers itself “ready” after:

- session restore has completed
- org membership lookup has completed
- organisation lookup has completed or failed cleanly

That prevents the app from redirecting into a half-loaded state.

### 3. Fix the `/projects` loading deadlock
Update `Projects.tsx` so it has explicit states:

- auth/org still loading
- signed in but no organisation access
- signed in with org access and projects loaded

It should never stay on an indefinite spinner just because `membership` is temporarily null.

### 4. Add clear fallback UI for access problems
If membership is genuinely missing, show a real message like:

- “You’re signed in, but this account doesn’t have org access yet.”

That makes the problem visible instead of looking like broken login.

### 5. Only after login works, revisit branded email/OTP
Once magic-link login is working end to end, we can decide whether to:
- keep magic links only, or
- reintroduce OTP with email templates that are guaranteed to send a 6-digit token

Right now, OTP is adding confusion and slowing us down.

## Technical details

### Files to update
- `src/contexts/AuthContext.tsx`
- `src/pages/Auth.tsx`
- `src/pages/Projects.tsx`

### No database changes needed
I do not see a schema problem blocking login. This looks like a frontend auth-state sequencing issue.

### Why this should unblock you quickly
Because:
- Supabase auth is working
- membership exists
- project data exists

So once the client waits properly for auth + org readiness, you should be able to log in and land in the app.

## Expected result after this pass

1. Enter email
2. Receive magic link
3. Click link
4. Return to app already authenticated
5. Land on project list instead of getting stuck
6. Open the existing project successfully

## After that
Once login is stable, the next pass can clean up:
- branded auth emails
- OTP if still needed
- project persistence across refresh/navigation hardening
