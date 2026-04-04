

# Fix: `setup-notion-workspace` Auth Error

## Problem
The edge function calls `supabase.auth.getClaims(token)` which doesn't exist in supabase-js v2. This causes a 500 error.

## Solution
Replace `getClaims` with `getUser(token)`, matching the pattern used in other edge functions like `push-asset-to-notion`.

## Changes

### `supabase/functions/setup-notion-workspace/index.ts`
Replace lines 26-33 (the `getClaims` block) with:
```typescript
const token = authHeader.replace("Bearer ", "");
const { data: { user }, error: authError } = await supabase.auth.getUser(token);
if (authError || !user) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

One file changed, ~4 lines replaced.

