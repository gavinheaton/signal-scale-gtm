

# Cache Brand Context for Reuse Across ICP Sessions

## Problem
Every new ICP wizard session asks "what's your website URL?" and re-crawls it. The user shouldn't have to repeat this for each segment — the brand analysis from the first crawl should persist at the project level and be injected into all subsequent wizard sessions (ICP and persona).

## Approach

Store the crawled website content and brand summary on the **projects** table as a JSONB column. The first ICP wizard session crawls the site, and the edge function saves that analysis. All future sessions skip the URL question and start with brand context pre-loaded.

## Changes

### 1. Database migration — add `brand_context` column to `projects`

```sql
ALTER TABLE public.projects 
ADD COLUMN brand_context jsonb DEFAULT '{}'::jsonb;
```

Stores: `{ website_url, crawled_content, brand_summary, crawled_at }`

No RLS changes needed — projects table already has org-scoped read/write policies.

### 2. Edge function: `supabase/functions/icp-wizard/index.ts`

**On session init** — query `projects.brand_context` for the current project. If it has content:
- Skip the "what's your website URL?" opening question
- Change the initial message to: "I already have context on your brand. Let's define a new ICP segment — what market or customer type are you targeting?"
- Inject the brand summary into the system prompt as a `BRAND CONTEXT` block

**On first URL crawl** — after fetching and cleaning the website content:
- Save it to `projects.brand_context` as `{ website_url, crawled_content (trimmed), crawled_at }`
- This persists for all future sessions

**System prompt update** — add a conditional section:
```
BRAND CONTEXT (from previous analysis):
{brand_context.crawled_content}
Use this to inform your ICP questions. Do NOT ask for the website URL again.
```

### 3. Edge function: `supabase/functions/persona-wizard/index.ts`

Same pattern — on session init, load `projects.brand_context` and inject it into the persona system prompt alongside the ICP data. The persona wizard already receives ICP context; brand context adds another layer.

### 4. Frontend: `src/pages/ICPWizard.tsx`

No major changes needed. The edge function handles the initial message change. The chat will simply start with a different opening question when brand context exists.

## Files to modify

- **Migration**: Add `brand_context jsonb` column to `projects`
- **`supabase/functions/icp-wizard/index.ts`**: Load brand context on init, save on first crawl, inject into system prompt, change initial message conditionally
- **`supabase/functions/persona-wizard/index.ts`**: Load and inject brand context into system prompt

