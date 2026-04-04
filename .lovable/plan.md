

# Update Campaign Wizard for Sequenced Content Schedules

## Overview
Add sequence/timing fields to campaign_assets and update the wizard to populate them when saving a completed campaign draft.

## 1. Database Migration

Add five new columns to `campaign_assets`:

```sql
ALTER TABLE campaign_assets 
  ADD COLUMN IF NOT EXISTS sequence_order integer,
  ADD COLUMN IF NOT EXISTS offset_days integer,
  ADD COLUMN IF NOT EXISTS production_due date,
  ADD COLUMN IF NOT EXISTS depends_on uuid REFERENCES campaign_assets(id),
  ADD COLUMN IF NOT EXISTS rationale text;
```

No RLS changes needed — existing policies cover all CRUD on campaign_assets.

## 2. TypeScript Types

Update `src/types/database.ts` — add the five fields to the `CampaignAsset` interface:
- `sequence_order: number | null`
- `offset_days: number | null`
- `production_due: string | null`
- `depends_on: string | null`
- `rationale: string | null`

Update `src/components/campaign-wizard/types.ts` — extend `ContentCalendarItem` with:
- `sequence_order?: number`
- `offset_days?: number`
- `publish_date?: string`
- `production_due?: string`
- `depends_on?: number` (references another item's sequence_order)
- `rationale?: string`

## 3. Campaign Wizard Save Logic

In `src/pages/CampaignWizard.tsx`, update the asset creation block (~line 224-233):

**First pass** — insert assets with all new fields except `depends_on`:
```typescript
const assets = draft.content_calendar.map((item, idx) => ({
  campaign_id: finalCampaignId,
  title: item.title,
  asset_type: FORMAT_TO_ASSET_TYPE[item.format?.toLowerCase()] || 'blog',
  status: 'brief',
  publish_date: item.publish_date || null,
  sequence_order: item.sequence_order ?? idx + 1,
  offset_days: item.offset_days ?? null,
  production_due: item.production_due ?? null,
  rationale: item.rationale ?? null,
}));

const { data: insertedAssets, error } = await supabase
  .from('campaign_assets')
  .insert(assets)
  .select('id, sequence_order');
```

**Second pass** — resolve `depends_on` references. For each content_calendar item that has a numeric `depends_on` (a sequence_order value), look up the inserted asset with that sequence_order and set the UUID:
```typescript
if (insertedAssets) {
  const seqMap = new Map(insertedAssets.map(a => [a.sequence_order, a.id]));
  const updates = draft.content_calendar
    .filter(item => item.depends_on != null)
    .map(item => {
      const assetId = seqMap.get(item.sequence_order);
      const dependsOnId = seqMap.get(item.depends_on);
      return assetId && dependsOnId ? { id: assetId, depends_on: dependsOnId } : null;
    })
    .filter(Boolean);
  
  for (const u of updates) {
    await supabase.from('campaign_assets').update({ depends_on: u.depends_on }).eq('id', u.id);
  }
}
```

## 4. Edge Function System Prompt Update

In `supabase/functions/campaign-wizard/index.ts`, update the draft format instructions (line 161) to tell Claude to include the new fields in content_calendar items:

Add to the DRAFT FORMAT INSTRUCTIONS section:
```
Each content_calendar item should include: title, format, persona, week, sequence_order (integer starting at 1), offset_days (days from campaign start), publish_date (YYYY-MM-DD), production_due (YYYY-MM-DD, typically 7 days before publish), depends_on (sequence_order of a prerequisite item, or null), rationale (why this content at this point in the journey).
```

## Files Changed
1. **Migration** — add 5 columns to campaign_assets
2. `src/types/database.ts` — add fields to CampaignAsset interface
3. `src/components/campaign-wizard/types.ts` — extend ContentCalendarItem
4. `src/pages/CampaignWizard.tsx` — two-pass insert with new fields
5. `supabase/functions/campaign-wizard/index.ts` — update draft format instructions

