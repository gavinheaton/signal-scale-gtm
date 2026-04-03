

# Fix: Login redirects back to /auth

## Problem
There's a race condition in `AuthContext.tsx`. The `onAuthStateChange` callback can fire before the session is restored from storage, setting `user=null` and `loading=false`. `AppLayout` sees `!user` with `loading=false` and immediately redirects to `/auth`.

## Solution
Restructure the auth initialization so that `getSession()` is the authority for the initial load, and `onAuthStateChange` only handles subsequent changes.

**File: `src/contexts/AuthContext.tsx`**

Rewrite the `useEffect`:

```typescript
useEffect(() => {
  // 1. Set up listener FIRST (catches changes after initial load)
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    setUser(session?.user ?? null);
    if (session?.user) {
      setTimeout(() => fetchOrgData(session.user.id), 0);
    } else {
      setMembership(null);
      setOrganisation(null);
    }
    // Do NOT set loading here — let getSession handle initial load
  });

  // 2. Restore session from storage (single source of truth for initial state)
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
    setUser(session?.user ?? null);
    if (session?.user) fetchOrgData(session.user.id);
    setLoading(false); // Only here
  });

  return () => subscription.unsubscribe();
}, []);
```

The key change: remove `setLoading(false)` from the `onAuthStateChange` callback. Only `getSession()` sets `loading=false`, ensuring the session is fully restored before any routing decisions are made.

