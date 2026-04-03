

# Fix: "No Organisation Access" Race Condition

## Problem
`AuthContext` has a race condition between bootstrap and sign-in:
1. Bootstrap runs → no session → sets `loading = false`, `bootstrapped = true`
2. User signs in → `onAuthStateChange` fires with session
3. `fetchOrgData` starts in `setTimeout(0)` — but `loading` is already `false`
4. Projects page renders immediately, sees `membership = null`, shows the error
5. A moment later `fetchOrgData` completes and sets membership — but user already saw the error

## Fix
In `AuthContext.tsx`, set `loading = true` when a new sign-in event arrives (before fetching org data), so the Projects page shows the spinner instead of the error.

### Changes to `src/contexts/AuthContext.tsx`
In the `onAuthStateChange` callback, when a session exists:
- Set `loading = true` immediately before calling `fetchOrgData`
- Set `loading = false` after `fetchOrgData` completes (regardless of `bootstrapped` flag)

```
// Before (buggy):
if (session?.user) {
  setTimeout(async () => {
    await fetchOrgData(session.user.id);
    if (mounted && !bootstrapped.current) {
      bootstrapped.current = true;
      setLoading(false);
    }
  }, 0);
}

// After (fixed):
if (session?.user) {
  setLoading(true);  // Show spinner while fetching org
  setTimeout(async () => {
    await fetchOrgData(session.user.id);
    if (mounted) {
      bootstrapped.current = true;
      setLoading(false);
    }
  }, 0);
}
```

Also handle the `else` branch (sign out) to ensure loading resets:
```
} else {
  setMembership(null);
  setOrganisation(null);
  if (mounted && bootstrapped.current) setLoading(false);
}
```

## Files Modified
- `src/contexts/AuthContext.tsx` — fix race condition in auth state change handler

## Scope
One file, ~5 lines changed. No database or edge function changes needed.
