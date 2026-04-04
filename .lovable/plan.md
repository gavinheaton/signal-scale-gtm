

# Notion Workspace Setup + Campaign-to-Calendar Sync

## Overview
Create an edge function that builds a full Notion content calendar workspace for a project, add a trigger button in Settings, and auto-populate the calendar when campaigns are saved.

## Important Caveat
The Notion Views API requires `Notion-Version: 2025-09-03`. The existing edge functions use `2022-06-28`. The new function will use the newer version, but creating views requires the `data_source_id` from the database response. If the newer API version causes issues, the function will gracefully skip view creation and fall back to the default table view that Notion auto-creates.

---

## Step 1: Database Migration

Add two nullable text columns to the `projects` table:

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notion_workspace_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notion_calendar_db_id text;
```

No new RLS policies needed -- existing project update policies cover these columns.

## Step 2: Edge Function `setup-notion-workspace`

**File:** `supabase/functions/setup-notion-workspace/index.ts`

- **Auth:** JWT validation in code (verify_jwt = false in config.toml, consistent with other functions)
- **Input:** `{ project_id }`
- **Secrets used:** `NOTION_API_KEY`, `NOTION_CAMPAIGN_BRIEFS_PAGE_ID` (as parent), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Logic:**
1. Validate user has org access to the project
2. Fetch project name
3. Create a Notion page under `NOTION_CAMPAIGN_BRIEFS_PAGE_ID` with title "[Project Name] -- GTM Workspace", icon, and intro content blocks
4. Create an inline database on that page with all specified properties (Content, Status, Channel, Content Type, Demand Type, Publish Date, Production Due, Campaign, Persona, Format, Assigned To, Brief URL, Notes)
5. Attempt to create 7 views using `POST /v1/views` with `Notion-Version: 2025-09-03`. If views API fails (older workspace, permission issue), log warning and continue -- the default table view still works.
6. Update project record with `notion_workspace_id` and `notion_calendar_db_id`
7. Return `{ success, workspace_url, calendar_db_id }`

## Step 3: Edge Function `add-campaign-to-notion`

**File:** `supabase/functions/add-campaign-to-notion/index.ts`

- **Input:** `{ campaign_id }`
- **Auth:** JWT in code

**Logic:**
1. Fetch campaign + its project's `notion_calendar_db_id`
2. If no `notion_calendar_db_id`, return error "Notion workspace not set up"
3. Fetch campaign assets (content_calendar items from wizard draft, or campaign_assets from DB)
4. For each item, create a page in the Notion database with properties mapped: title, channel, content type, publish date, production due, demand type, persona, format
5. Return `{ success, items_pushed }`

## Step 4: Update `supabase/config.toml`

Add entries for both new functions with `verify_jwt = false`.

## Step 5: Settings UI -- Notion Workspace Card

**File:** `src/pages/Settings.tsx`

Add a new "Integrations" card (below Connections, above ApiAccessCard) visible to admin+ with a project selected:

- Fetch `notion_workspace_id` from `currentProject`
- **Not set up:** Show a "Set up Notion Workspace" button with Notion icon. On click, call `setup-notion-workspace` edge function. Show loading spinner. On success, show toast and update local state.
- **Already set up:** Show green "Workspace Ready" badge, an "Open in Notion" link (constructed from workspace ID), and a small "Re-sync" button that re-runs the setup (which will create a new workspace -- or we can add idempotency later).

This requires the `Project` type and `ProjectContext` to include the new columns. Update `src/types/database.ts` to add `notion_workspace_id` and `notion_calendar_db_id` to the `Project` interface.

## Step 6: Wire Campaign Save to Notion

**File:** `src/pages/CampaignWizard.tsx`

In the `saveCampaign` function, after successfully inserting/updating the campaign and assets:
1. Check if `currentProject` has a `notion_calendar_db_id`
2. If yes, call `add-campaign-to-notion` with the campaign ID (fire-and-forget with a toast on success/failure)
3. This runs in the background so it doesn't block navigation

## Step 7: Update `src/types/database.ts`

Add to the `Project` interface:
```typescript
notion_workspace_id?: string | null;
notion_calendar_db_id?: string | null;
```

## Step 8: Refresh project data

Update `ProjectContext` or the Settings page to re-fetch the project after workspace setup so the new IDs are available locally.

---

## Files Changed
1. `supabase/migrations/XXXX_add_notion_workspace_columns.sql` -- migration
2. `supabase/functions/setup-notion-workspace/index.ts` -- new edge function
3. `supabase/functions/add-campaign-to-notion/index.ts` -- new edge function
4. `supabase/config.toml` -- add two function entries
5. `src/pages/Settings.tsx` -- add Notion Workspace integration card
6. `src/pages/CampaignWizard.tsx` -- call add-campaign-to-notion after save
7. `src/types/database.ts` -- add fields to Project interface

