## Problem

The `invite-user` edge function returns 500 with no runtime logs — meaning it crashes at boot. The cause is this import at the top of `supabase/functions/invite-user/index.ts`:

```ts
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
```

That path doesn't exist on esm.sh, so the module fails to load and every request returns 500. The sibling `admin-users` function (which works) imports from the local shared helper instead: `../_shared/cors.ts`.

## Fix

Edit `supabase/functions/invite-user/index.ts` only:

1. Replace the broken CORS import with `import { corsHeaders } from "../_shared/cors.ts";` (matches every other function in the project).
2. While in the file, replace the `auth.getClaims(...)` call with the standard `auth.getUser()` pattern used by `admin-users` — `getClaims` on the anon client with a manually-stripped token is fragile and inconsistent with the rest of the codebase. Behaviour is unchanged: we still derive `callerId = user.id` and continue.

No schema changes, no new secrets, no frontend changes. After redeploy, invite flow works again.
