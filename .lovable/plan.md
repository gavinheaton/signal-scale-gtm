
# Login Fix Plan — Callback-First Auth

I checked the current auth code again. The remaining issue is no longer just org loading. The bigger weakness is that the app is trying to complete a magic-link login inside the normal `/` → `/projects` → `/auth` routing flow, without a dedicated callback step.

## What I found

- Supabase auth logs show successful login events for your user.
- `Auth.tsx` sends magic links back to `window.location.origin`, not to a dedicated callback route.
- `App.tsx` immediately redirects `/` to `/projects`.
- `AppLayout` immediately redirects unauthenticated users back to `/auth`.
- `AuthContext` still has two separate startup paths (`onAuthStateChange` and `getSession`) that can each flip `loading` off.
- If the session is parsed slightly late, the app can bounce back to `/auth` and look like login failed.

## Most likely root cause

A race between:
1. Supabase processing the magic-link return,
2. React Router redirecting `/` to `/projects`,
3. `AppLayout` redirecting back to `/auth`,
4. `AuthContext` deciding auth is ready too early.

There is also an important environment risk: auth sessions are origin-specific. If login happens on one origin and you inspect another, the session will not appear there.

```text
signal2scale.com.au            -> separate session storage
signal-scale-gtm.lovable.app   -> separate session storage
id-preview--...lovable.app     -> separate session storage
```

## Updated implementation plan

### 1. Add a dedicated auth callback route
Create a public route like `/auth/callback` that exists only to finish login.

Why:
- gives Supabase one stable return URL
- avoids routing away before the session is established
- lets us show a clear “Signing you in…” state instead of dropping back to `/auth`

### 2. Change magic-link redirects to use the callback route
Update `Auth.tsx` to send users to:

```text
${window.location.origin}/auth/callback
```

instead of just the site root.

### 3. Refactor `AuthContext` into a single bootstrap flow
Make auth startup deterministic:

- register auth listener
- run one initial session bootstrap
- only mark `loading = false` after session resolution and org lookup are complete
- avoid multiple code paths independently clearing loading

The listener should handle later sign-in/sign-out events, but initial readiness should come from one controlled bootstrap path.

### 4. Add callback-page fallback logic
In the callback page:

- wait for Supabase to finish processing the returned session
- if a session appears, redirect to `/projects`
- if an auth error exists, show it clearly
- if no session appears after a short wait, show a useful recovery message instead of silently dumping the user back to `/auth`

### 5. Keep project loading separate from login success
Leave the `/projects` page resilient, but treat these as different states:

- signed out
- signed in but org still loading
- signed in with no org access
- signed in with org access

That prevents “auth failed” and “no org membership” from looking identical.

### 6. Test on one origin only
When implementing, verify the full flow end-to-end on the same domain where the magic link was requested.

Example:
- request link on preview → open link on preview
- request link on custom domain → open link on custom domain

Do not mix preview and published/custom domains during testing.

## Files to update

- `src/App.tsx`
- `src/contexts/AuthContext.tsx`
- `src/pages/Auth.tsx`
- `src/pages/Projects.tsx`
- new callback page, e.g. `src/pages/AuthCallback.tsx`

## No database changes needed

This still looks like a frontend auth/session orchestration issue, not a schema problem.

## Expected result after this pass

1. Enter email on `/auth`
2. Receive magic link
3. Click link
4. Land on `/auth/callback`
5. Session finalizes cleanly
6. Redirect to `/projects`
7. Continue into the app without falling back to `/auth`
