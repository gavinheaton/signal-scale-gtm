## Problem

The new `import-prompt-from-source` edge function fails its CORS preflight because it isn't actually running. The likely cause: it imports prompt constants from sibling edge functions:

```ts
import { ICP_SYSTEM_PROMPT } from "../icp-wizard/index.ts";
import { PERSONA_SYSTEM_PROMPT } from "../persona-wizard/index.ts";
import { FALLBACK_SYSTEM_PROMPT as BRAND_VOICE_FALLBACK } from "../brand-voice-wizard/index.ts";
```

Supabase deploys each function in isolation. Cross-function relative imports pull in those files' top-level `Deno.serve(...)` calls and their own deps, which breaks deployment — the function crashes on cold start and the preflight returns a non-200, surfacing as a CORS error in the browser.

## Fix

Move the fallback prompt texts into a shared module that contains no `Deno.serve` and no side effects, then import from there.

### Steps

1. Create `supabase/functions/_shared/defaultPrompts.ts` exporting three string constants:
   - `ICP_SYSTEM_PROMPT`
   - `PERSONA_SYSTEM_PROMPT`
   - `BRAND_VOICE_FALLBACK_SYSTEM_PROMPT`
   
   Copy the current text verbatim from the three wizard files.

2. Update the three wizard `index.ts` files to re-export / import from the shared module instead of declaring the constant locally. Keeps existing wizard behaviour identical.

3. Update `supabase/functions/import-prompt-from-source/index.ts` to import only from `../_shared/defaultPrompts.ts` — no sibling-function imports.

4. Redeploy `import-prompt-from-source` (and the three wizards) and verify the preflight returns 200, then test the "Import current" button from the Admin UI.

## Why this works

`_shared/` modules contain pure exports with no `Deno.serve`, so they're safe to import from any function. This matches the existing pattern used by `_shared/promptTemplates.ts`, `_shared/cors.ts`, etc.

No database changes, no UI changes — purely an edge-function packaging fix.
