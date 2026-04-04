

# Skip Already-Pushed Assets in Notion Sync

## Problem
When pushing to Notion, assets that already have a `notion_url` are re-sent, creating duplicates. The UI also counts them in the "Push All to Notion" button count.

## Changes

### 1. `src/pages/Campaigns.tsx`
- Change `withContent` count (line 105) to exclude assets that already have a `notion_url`:
  ```
  const pushableCount = assets.filter(a => a.content && !a.notion_url).length;
  ```
- Update the "Push All to Notion" button to use `pushableCount` instead of `withContent` and disable when 0
- Show a separate indicator for already-pushed assets (e.g. "X already in Notion")

### 2. `supabase/functions/add-campaign-to-notion/index.ts`
- Add `.is("notion_url", null)` filter to the asset query (line 99-102) so only un-pushed assets are fetched server-side

### 3. `supabase/functions/bulk-push-campaign-to-notion/index.ts`
- Add `.is("notion_url", null)` filter to the asset query (line 100-104) so already-pushed assets are skipped server-side
- After successful push, update each asset's `notion_url` with the created Notion page URL (currently only the campaign gets a `notion_url`, individual assets do not)

### 4. `supabase/functions/add-campaign-to-notion/index.ts` (additional)
- After each successful Notion page creation, update the asset record with the returned Notion page URL so it's marked as pushed

## Files changed
1. `src/pages/Campaigns.tsx` — filter UI count to exclude already-pushed assets
2. `supabase/functions/add-campaign-to-notion/index.ts` — skip assets with `notion_url`, save `notion_url` per asset after push
3. `supabase/functions/bulk-push-campaign-to-notion/index.ts` — skip assets with `notion_url`, save `notion_url` per asset after push

