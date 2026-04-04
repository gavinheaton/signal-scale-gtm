
Root cause

- The browser shows a 502, but the actual Notion error in the edge-function logs is:
  `404 object_not_found`
- Notion is saying it cannot access page `3378e087-684e-80bb-a019-da1244601619` and explicitly says to share it with the integration `Signal2Scale`.
- So the UUID parsing fix is working. The request is reaching Notion now. The remaining problem is Notion access/configuration.

Do we need Notion MCP?

- No. MCP is for helping the Lovable agent access Notion while building.
- Your app runtime still needs the Notion API via Supabase edge functions.
- So the correct approach is to keep the current Notion API integration, not switch to MCP.

Plan

1. Keep the current Notion API flow and fix the real issue: parent-page access.
2. Harden these edge functions so they return actionable errors instead of a generic 502:
   - `supabase/functions/push-asset-to-notion/index.ts`
   - `supabase/functions/bulk-push-campaign-to-notion/index.ts`
   - `supabase/functions/create-notion-campaign-brief/index.ts`
3. Map Notion `object_not_found` / permission failures to a clearer message such as:
   - “The target Notion page is not shared with the Signal2Scale integration.”
   - “Update `NOTION_CAMPAIGN_BRIEFS_PAGE_ID` if it points to the wrong page.”
4. Update `src/components/campaigns/AssetDetailDrawer.tsx` so the toast surfaces the returned Notion details instead of only “Push failed”.
5. Align all Notion functions to use the same parent-ID normalization logic. `create-notion-campaign-brief` still uses the raw secret and should be brought in line with the other Notion functions.
6. Verify all affected flows:
   - single asset push
   - bulk campaign push
   - campaign brief creation

Required Notion setup

1. Open the target Notion page referenced by `NOTION_CAMPAIGN_BRIEFS_PAGE_ID`
2. Click `Share`
3. Add the `Signal2Scale` integration to that page (or its parent database/workspace, depending on how it is organized)
4. If that page was moved, duplicated, or belongs to another workspace, replace the secret with the correct shared page URL/ID

If the target is actually a database

- Then these functions should use `parent.database_id` instead of `parent.page_id`.
- I would keep the current page-based setup unless you confirm the destination is meant to be a database, because the existing payload is structured for child pages under a page.

Technical details

- Real upstream error from logs:
  `Could not find page with ID ... Make sure the relevant pages and databases are shared with your integration "Signal2Scale".`
- That means this is no longer a formatting issue and not an MCP issue; it is a Notion permission/target issue.
