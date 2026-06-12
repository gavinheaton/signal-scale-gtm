## Problem

Disconnecting Notion fails with:
> Method DELETE is not allowed by Access-Control-Allow-Methods in preflight response.

The `manage-project-connection` edge function defines its own `corsHeaders` without `Access-Control-Allow-Methods`. Browsers default-allow only simple methods (GET/HEAD/POST) on preflight, so `DELETE` is blocked.

## Fix

In `supabase/functions/manage-project-connection/index.ts`, add `Access-Control-Allow-Methods` to the local `corsHeaders`:

```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
```

That's the only change required — the OPTIONS handler already returns these headers, and DELETE handling logic is already implemented.

## Verify

After redeploy, retry "Disconnect" on the Notion card in Settings; preflight should succeed and the connection row + vault secret should be removed.
