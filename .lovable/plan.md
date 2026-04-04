

# Add Campaign Dates — Wizard + Detail Page Editing

## Problem
The `campaigns` table has `launch_date` and `end_date` columns, but nothing in the app populates them. The Timeline and Journey View components silently return null/empty when these are missing.

## Solution — Two entry points for setting dates

### 1. Campaign Wizard: AI generates dates in the draft

**`src/components/campaign-wizard/types.ts`** — Add `launch_date?: string` and `end_date?: string` to `CampaignDraft`.

**`supabase/functions/campaign-wizard/index.ts`** — Update the DRAFT FORMAT INSTRUCTIONS to tell Claude to include `launch_date` (YYYY-MM-DD) and `end_date` (YYYY-MM-DD) in the draft JSON, derived from the content calendar span (earliest publish_date minus a buffer, latest publish_date plus a buffer) or from explicit user input.

**`src/pages/CampaignWizard.tsx`** — In both `saveDraft()` and `saveCampaign()`, include `launch_date: draft.launch_date || null` and `end_date: draft.end_date || null` in the campaign payload.

**`src/components/campaign-wizard/CampaignPreviewPanel.tsx`** — Show the dates in the preview panel so the user can see them before saving.

### 2. Campaign Detail Page: inline date editing

**`src/pages/Campaigns.tsx`** — In the campaign detail header area (below the name/badges, around line 125-140), add two date picker popovers for Launch Date and End Date. On change, update the campaign in Supabase and refresh local state. Use the Shadcn Calendar + Popover pattern.

### Files changed
1. `src/components/campaign-wizard/types.ts` — add date fields to CampaignDraft
2. `supabase/functions/campaign-wizard/index.ts` — prompt update for dates
3. `src/pages/CampaignWizard.tsx` — include dates in save payloads
4. `src/components/campaign-wizard/CampaignPreviewPanel.tsx` — display dates in preview
5. `src/pages/Campaigns.tsx` — add inline date pickers to campaign detail header

### Technical details
- Date pickers use Shadcn `Calendar` inside `Popover` with `pointer-events-auto`
- On date change in detail page: `supabase.from('campaigns').update({ launch_date }).eq('id', campaign.id)` then update local state
- Wizard draft format instruction addition: `"Include launch_date and end_date (YYYY-MM-DD) in the draft. Derive from the content calendar: launch_date = earliest publish_date minus 7 days prep, end_date = latest publish_date plus 7 days."`
- No schema changes needed — columns already exist

