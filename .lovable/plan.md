

# Notion Sync Status — Data Comparison + Last Synced Timestamp

## Overview
Add a new edge function that queries both Supabase and Notion to compare content counts, and track the last time data was pushed. Display results in the Settings page Notion Workspace card.

## Changes

### 1. New edge function: `supabase/functions/check-notion-sync/index.ts`

Queries both sides and returns a comparison:

- **Supabase side**: Count campaigns, campaign_assets, and personas for the project
- **Notion side**: Query each stored database ID (calendar, pillars, foundations) via `POST /v1/databases/{id}/query` with an empty filter and `page_size: 1` — the response includes a total via pagination. Also verify each DB is accessible (health check as a side effect).
- **Last synced**: Query the `project_connections` table `updated_at` for the Notion provider, plus check campaign_assets for the most recent `notion_url IS NOT NULL` record's timestamp.

Returns:
```json
{
  "supabase": { "campaigns": 5, "assets": 23, "personas": 4 },
  "notion": { "calendar_entries": 20, "pillars": 4, "foundations": 5 },
  "last_synced_at": "2026-04-03T14:22:00Z",
  "databases_accessible": { "calendar": true, "pillars": true, "foundations": true },
  "gaps": { "assets_not_in_notion": 3 }
}
```

The "gaps" field compares Supabase asset count vs Notion calendar entries to flag unsynced content.

### 2. Update `src/pages/Settings.tsx` — Notion Workspace card

When workspace is connected, add a "Check Sync" button that:
- Calls `check-notion-sync` with the project ID
- Shows a compact sync status panel below the existing workspace row:
  - **Last synced**: relative timestamp (e.g. "2 hours ago")
  - **Data comparison**: simple table — Supabase count vs Notion count for Calendar, Pillars, Foundations
  - **Status indicators**: green check if counts match, orange warning if gaps exist
  - **Unsynced items**: "3 assets not yet pushed to Notion" with a count

### 3. Add `notion_last_synced_at` column to `projects` table

A timestamp updated whenever any Notion push function completes successfully. This gives a reliable "last synced" without querying Notion every time.

Update in these edge functions to set `notion_last_synced_at = now()` on success:
- `setup-notion-workspace`
- `add-campaign-to-notion`
- `push-asset-to-notion`
- `bulk-push-campaign-to-notion`

### 4. Update `src/types/database.ts`

Add `notion_last_synced_at?: string | null` to the `Project` interface.

## Files changed
1. `supabase/migrations/XXXX_add_notion_last_synced.sql` — add column
2. `supabase/functions/check-notion-sync/index.ts` — new function
3. `supabase/functions/setup-notion-workspace/index.ts` — set `notion_last_synced_at`
4. `supabase/functions/add-campaign-to-notion/index.ts` — set `notion_last_synced_at`
5. `supabase/functions/push-asset-to-notion/index.ts` — set `notion_last_synced_at`
6. `supabase/functions/bulk-push-campaign-to-notion/index.ts` — set `notion_last_synced_at`
7. `src/pages/Settings.tsx` — sync status UI
8. `src/types/database.ts` — add field

