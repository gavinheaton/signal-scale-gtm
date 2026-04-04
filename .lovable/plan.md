

# Per-Project Notion Routing

## Problem
Three edge functions use a single hardcoded env var (`NOTION_CAMPAIGN_BRIEFS_PAGE_ID`) as the Notion parent — every project writes to the same Notion page. Only `add-campaign-to-notion` correctly looks up the project's own `notion_calendar_db_id`.

**Functions with the problem:**
1. `push-asset-to-notion` — uses `NOTION_CAMPAIGN_BRIEFS_PAGE_ID` as fallback parent page
2. `bulk-push-campaign-to-notion` — same hardcoded env var
3. `create-notion-campaign-brief` — same hardcoded env var
4. `setup-notion-workspace` — creates workspace under the shared env var page (this one is somewhat intentional as a "root", but should accept per-project parent)

## Solution

### 1. Rewrite `push-asset-to-notion`
- Remove `NOTION_PARENT_PAGE_ID` env var usage
- Look up asset → campaign → project → `notion_calendar_db_id`
- Use `database_id` parent (not `page_id`) with Content Calendar properties (same pattern as `add-campaign-to-notion`)
- Return error if project has no `notion_calendar_db_id` set

### 2. Rewrite `bulk-push-campaign-to-notion`
- Remove `NOTION_PARENT_PAGE_ID` env var usage
- Look up campaign → project → `notion_calendar_db_id`
- Create individual database entries per asset (like `add-campaign-to-notion`) instead of one consolidated page
- Each asset gets its own Content Calendar row with properties (Channel, Status, Demand Type, etc.)

### 3. Rewrite `create-notion-campaign-brief`
- Accept `project_id` in the request body
- Look up project's `notion_calendar_db_id`
- Route each `content_calendar` item as a database entry with proper properties
- Create one additional "Campaign Brief" entry containing the strategy summary as page body
- Fall back to current page-based behavior only if no `project_id` or no `notion_calendar_db_id`

### 4. Update `setup-notion-workspace`
- Accept optional `parent_page_id` in the request body to override the env var
- Store the parent page as `notion_workspace_id` on the project (already does this)
- This allows different projects to have workspaces under different Notion pages

### 5. Seed DC project's calendar DB ID
- Use INSERT tool to run: `UPDATE projects SET notion_calendar_db_id = '3388e087-684e-81d3-91f6-fd4e01ddedad' WHERE notion_calendar_db_id IS NULL` (scoped to the DC project)
- Need to identify the DC project ID first via a query

## Technical Details

All three rewritten functions will follow the same pattern already used in `add-campaign-to-notion`:

```text
1. Auth check (getUser)
2. Fetch the relevant record (asset/campaign)
3. Join to project → get notion_calendar_db_id
4. Use parent: { database_id: notion_calendar_db_id }
5. Map properties: Content, Status, Channel, Content Type, Demand Type, Publish Date, Campaign, Persona
6. Content goes in children[] as page body blocks
7. Update notion_last_synced_at on project
```

## Files changed
1. `supabase/functions/push-asset-to-notion/index.ts` — full rewrite
2. `supabase/functions/bulk-push-campaign-to-notion/index.ts` — full rewrite
3. `supabase/functions/create-notion-campaign-brief/index.ts` — full rewrite
4. `supabase/functions/setup-notion-workspace/index.ts` — accept optional `parent_page_id` override
5. Data update: seed `notion_calendar_db_id` on DC project

