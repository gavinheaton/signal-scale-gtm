

# Recover the Newsletter Campaign from the Abandoned Wizard Session

## What I found

Wizard session `47baebe4-…` for Disruptors Co contains a fully fleshed-out brief that never got saved as a campaign:

- **Name**: "Disruptors Co — 12-Week Newsletter Arc"
- **Launch → End**: 2025-04-22 → 2025-07-22
- **Calendar**: 36 items (Monday "The Lens" + Wednesday "Convert/Curate" + weekly blog anchors across Strategy / AI / Innovation / GTM threads)
- **Sections complete**: all six (target_audience, campaign_insight, objective, channel_mix, content_calendar, success_metrics)
- **Why it's missing**: `is_complete=false` and `notion_brief_ready=false` — the user never sent the final confirmation message, so the wizard never inserted a `campaigns` row or pushed to Notion.

The draft is solid enough to recover directly. No need to redo the wizard.

## Recovery plan

### 1. One-off recovery script (edge function: `recover-wizard-campaign`)
A small admin-only edge function that, given a `session_id`:
1. Loads the wizard session and validates it belongs to a project the caller has access to.
2. Maps `draft_output` → `campaigns` row:
   - `name` ← `campaign_name`
   - `track` ← `'demand_creation'` (mixed 95/5 — defaults to creation since calendar is dominantly Demand Creation)
   - `status` ← `'planning'`
   - `objective` ← serialised summary
   - `target_icp_ids` ← resolved from `target_audience` against project's existing ICPs (best-effort name match; empty array if none match)
   - `channel_mix`, `launch_date`, `end_date` ← copied through
3. Inserts each `content_calendar` item as a `campaign_assets` row, mapping:
   - `format`/`channel` → `asset_type` (Email → `email`, Blog — Thought Leadership → `blog`)
   - `title`, `publish_date`, `production_due`, `sequence_order`, `offset_days`, `rationale` → direct copy
   - `depends_on` → resolved to the new asset UUID after first pass
   - `status` ← `'brief'`
4. Marks the wizard session `status='complete'` and stamps `draft_output.is_complete=true` so it doesn't show as abandoned.
5. Returns `{ campaign_id, asset_count }`.

### 2. Trigger it once
Run the function for session `47baebe4-418d-45d5-b23b-0901614e182c`. Verify:
- New row in `campaigns` for the Disruptors Co project
- 36 rows in `campaign_assets`
- The campaign appears in the Campaigns kanban under "Planning"

### 3. Optional: surface abandoned sessions in Admin
Add a small "Abandoned wizard sessions" panel to `AdminDashboard.tsx` listing in-progress sessions older than 7 days, with a one-click "Recover as campaign" button that calls the same function. Prevents this from happening silently again.

### 4. Bonus fix: campaign-wizard save resilience
Update `supabase/functions/campaign-wizard/index.ts` so that when `sections_complete` covers all six sections, it auto-prompts the user with: *"All sections look complete. Reply 'create campaign' to save this brief and push to Notion."* — gives an obvious finish line so future drafts don't strand.

## Files

**New**
- `supabase/functions/recover-wizard-campaign/index.ts`

**Modified**
- `supabase/config.toml` — register new function
- `src/pages/AdminDashboard.tsx` — abandoned-sessions panel + recover button (optional, recommended)
- `supabase/functions/campaign-wizard/index.ts` — completion nudge when all sections done

## Notes

- No schema changes — uses existing `campaigns` and `campaign_assets` tables.
- The `track` field will be set to `demand_creation` since the brief is 95% creation / 5% capture. Easy to flip later via the campaign edit drawer.
- ICP linking is best-effort — if no match, the campaign saves with empty `target_icp_ids` and you can attach ICPs from the campaign detail view.

