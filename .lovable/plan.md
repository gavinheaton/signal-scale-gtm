

# Group Content Pipeline by Campaign

## What changes

`/project/content` currently renders one flat table of all `campaign_assets`. Switch to a **campaign-grouped layout** with the most recent campaign first.

## Layout

```text
┌─ Content Pipeline ─────────────────────────────────────────┐
│  [Status filter] [Type filter]                             │
│                                                            │
│  ▼ Disruptors Co — 12-Week Newsletter Arc                  │
│     planning · Apr 22 → Jul 22 · 36 assets                 │
│     ┌──────────────────────────────────────────────────┐   │
│     │ Title │ Type │ Status │ Publish Date             │   │
│     │ ...   │ ...  │ ...    │ ...                      │   │
│     └──────────────────────────────────────────────────┘   │
│                                                            │
│  ▶ Healthcare AI 90-Day Sprint                             │
│     active · Mar 19 → ... · 13 assets                      │
│                                                            │
│  ▶ (campaigns with no assets — collapsed, muted)           │
└────────────────────────────────────────────────────────────┘
```

- One **collapsible section per campaign**, ordered by `launch_date DESC` (latest first); campaigns without `launch_date` fall to the bottom.
- The latest campaign is **expanded by default**; the rest collapsed.
- Section header shows: campaign name, status badge, launch → end date range, asset count (post-filter / total).
- The Campaign column is removed from the table (now redundant — it's the section header).
- Filters apply within each group; a group with zero matches after filtering is hidden.
- Empty state when no campaigns exist for the project: existing "No assets found" message reworded.

## Technical changes

**File**: `src/pages/ContentPipeline.tsx` (only file touched)

1. Sort `campaigns` array by `launch_date` desc (nulls last) after fetch.
2. Build a `Map<campaignId, CampaignAsset[]>` from filtered assets.
3. Replace the single `<Table>` with a list of `<Collapsible>` sections (already available at `src/components/ui/collapsible.tsx`), each containing its own table.
4. Track expanded state with `useState<Set<string>>`; initialise with the first campaign's id.
5. Section header: flex row with `ChevronRight`/`ChevronDown` icon (lucide-react), campaign name (font-semibold), status `Badge`, date range and asset count in `text-muted-foreground`.
6. Drop the `campaign_name` denorm field on assets — no longer needed.
7. Keep the existing `Sheet` asset detail drawer unchanged.

No schema, edge function, or routing changes.

