

# Rebuild setup-notion-workspace — Full Content Strategy Workspace

## Overview
Complete rewrite of the edge function to create a rich, multi-section Notion workspace instead of a bare database. Also requires a DB migration for new column storage and updates to campaign save flow for seeding.

## Notion API Constraints (important)
- **No linked views**: The Notion API does not support creating linked/filtered views of existing databases. Per-channel sections and the Ideas pool will use separate inline databases with the same schema and a comment noting this limitation.
- **No view creation**: The `/v1/views` endpoint is not in the stable API. Views (calendar, board, table) cannot be created programmatically — the default table view is what users get. Comments will note which views to set up manually.
- **100 children limit**: Page creation accepts max 100 children blocks. Additional blocks must be appended via `PATCH /v1/blocks/{id}/children` in batches.
- **Table blocks**: Supported via `type: "table"` with `table_row` children.

## Changes

### 1. Database migration
Add two columns to `projects`:
```sql
ALTER TABLE projects ADD COLUMN notion_pillars_db_id text;
ALTER TABLE projects ADD COLUMN notion_foundations_db_id text;
```
Update `src/types/database.ts` Project interface to include these fields.

### 2. Rewrite `supabase/functions/setup-notion-workspace/index.ts`

The function will execute these steps sequentially via the Notion API:

**Step 1 — Create parent page** under `NOTION_CAMPAIGN_BRIEFS_PAGE_ID` with icon 🎯, title `{project.name} — GTM Workspace`, and initial children for Section 1 (This Week) and Section 2 heading.

**Step 2 — Append Section 1: This Week**
- `heading_2`: "This week"
- `table` block: 1 header row (Mon–Fri + Next week), 1 empty row with `to_do` blocks in each cell.
- Note: Notion table blocks use `table_row` children with cells as arrays of rich_text. To-do blocks cannot be nested inside table cells — will use empty text cells with a to_do list below the table instead.

**Step 3 — Create Content Pillars database** (inline, `is_inline: true`)
- Properties: Pillar (title), Description (rich_text), Colour (select: Red/Blue/Green/Yellow), Active (checkbox)
- Create 4 placeholder pages: "Content Pillar #1" through "#4"
- Save `pillarsDbId`

**Step 4 — Create Strategic Foundations database** (inline)
- Properties: Foundation (title), Detail (rich_text), Type (select: Audience/Growth Goal/Outcome/Motivation/Industry/Other)
- Create 5 placeholder pages: Audience, Growth Goal, Outcome, Motivation, Industry
- Save `foundationsDbId`

**Step 5 — Append Section 4: Reference sidebar**
- `column_list` block with 3 columns:
  - Col 1: heading_3 "Links" + bulleted list items (YouTube, Instagram, LinkedIn, TikTok, Brand Identity, Full view of content)
  - Col 2: heading_3 "Templates" + bulleted list items (Campaign Brief Template, LinkedIn Post Template, Email Template, Content Brief)
  - Col 3: heading_3 "Branding" + bulleted list items (Primary Colour, Accent Colour, Highlight Colour, Font)

**Step 6 — Create Content Calendar database** (inline)
- Same schema as current (Status, Channel, Content Type, Demand Type, Publish Date, Production Due, Campaign, Persona, Format, Assigned To, Brief URL, Notes)
- Add `Pillar` property as a `relation` to the Content Pillars database
- Save `calendarDbId`

**Step 7 — Per-channel sections**
For each of LinkedIn, Email, TikTok, Instagram, YouTube:
- Append `heading_2`: channel name
- Append `heading_3`: "Calendar"
- Create a separate inline database per channel with the same Content Calendar schema, filtered by design (title includes channel name). Add a comment in code noting these are channel-specific copies pending Notion API linked view support.

**Step 8 — Ideas section**
- Append `heading_2`: "Ideas"
- Append a paragraph noting: "Filter Content Calendar by Status = Idea to see all content ideas. (Linked views not available via API — set up manually in Notion.)"

**Step 9 — Update project record**
```typescript
await adminClient.from("projects").update({
  notion_workspace_id: workspacePageId,
  notion_calendar_db_id: calendarDbId,
  notion_pillars_db_id: pillarsDbId,
  notion_foundations_db_id: foundationsDbId,
}).eq("id", project_id);
```

**Step 10 — Return response**
```json
{
  "success": true,
  "workspace_url": "https://notion.so/...",
  "calendar_db_id": "...",
  "pillars_db_id": "...",
  "foundations_db_id": "..."
}
```

**Block batching**: The function will build all children blocks and split into batches of 100. The first batch goes in the page creation call; subsequent batches use `PATCH /v1/blocks/{pageId}/children`.

### 3. Update `src/types/database.ts`
Add `notion_pillars_db_id` and `notion_foundations_db_id` to the `Project` interface.

### 4. Campaign save seeding (update `add-campaign-to-notion`)
When a campaign is saved to Notion:
- Read campaign's `target_icp_ids` → fetch associated personas → create Foundation pages with Type = "Audience" in the Strategic Foundations database
- Read campaign objective → create/update "Growth Goal" foundation page
- Populate Content Calendar entries with Pillar field left blank

This requires the function to fetch `notion_foundations_db_id` and `notion_calendar_db_id` from the project record.

### 5. Fix `add-campaign-to-notion` auth bug
Replace `getClaims(token)` with `getUser(token)` — same fix applied to other functions previously.

## Files changed
1. `supabase/migrations/XXXX_add_notion_pillar_foundation_columns.sql` — new columns
2. `supabase/functions/setup-notion-workspace/index.ts` — full rewrite
3. `supabase/functions/add-campaign-to-notion/index.ts` — auth fix + seeding logic
4. `src/types/database.ts` — add new fields to Project interface

