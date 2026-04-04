
# Fix Notion workspace setup 502

## Root cause
The edge-function logs show the real failure: Notion is rejecting `parent.page_id` because `NOTION_CAMPAIGN_BRIEFS_PAGE_ID` currently contains a full Notion URL, while `setup-notion-workspace` sends it directly as if it were already a UUID.

The Chrome-extension errors are unrelated. The actual app error is the 502 from `setup-notion-workspace`, which is just wrapping Notion’s 400 validation error.

## Plan
1. Update `supabase/functions/setup-notion-workspace/index.ts`
   - Add the same `extractNotionId()` helper already used in other Notion functions.
   - Read the secret into a raw variable, normalize it to a page UUID, and use the normalized value in:
     ```ts
     parent: { page_id: normalizedParentPageId }
     ```

2. Add defensive validation
   - Before calling Notion, verify the extracted value looks like a valid Notion page ID.
   - If it does not, return a clear config error such as:
     - `NOTION_CAMPAIGN_BRIEFS_PAGE_ID must be a Notion page ID or full Notion URL`

3. Keep behavior consistent across the Notion integration
   - Align `setup-notion-workspace` with the existing behavior already implemented in:
     - `supabase/functions/create-notion-campaign-brief/index.ts`
     - `supabase/functions/push-asset-to-notion/index.ts`
     - `supabase/functions/bulk-push-campaign-to-notion/index.ts`

## Expected outcome
- Workspace setup works whether the secret is stored as:
  - a raw Notion UUID, or
  - a full Notion page URL
- If the secret is malformed, the user gets a precise setup error instead of a generic 502

## File to change
- `supabase/functions/setup-notion-workspace/index.ts`
