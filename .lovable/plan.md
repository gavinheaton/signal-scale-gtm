

# Fix Journey View: Show Unscheduled Assets + Lower Threshold

## Problem
Assets without a `publish_date` are invisible in the Journey View. The view requires at least 3 dated assets before rendering anything. This creates a chicken-and-egg problem: you can't drag assets onto the timeline because they don't appear until they already have dates.

## Solution
Add an **unscheduled assets tray** below the swimlane timeline, and lower the minimum threshold from 3 to 0 dated assets (as long as the campaign has start/end dates).

### Changes to `src/components/campaigns/CampaignJourneyView.tsx`

**1. Compute unscheduled assets**
Add a `useMemo` that filters assets *without* a `publish_date`:
```typescript
const undatedAssets = useMemo(() =>
  assets.filter(a => !a.publish_date), [assets]);
```

**2. Lower the empty-state threshold**
Remove the `datedAssets.length < 3` guard entirely. If we have start/end dates, always render the timeline — even if empty. The unscheduled tray gives users something to drag from.

**3. Add unscheduled tray UI**
Below the swimlanes container, render a horizontal tray of draggable asset cards for undated assets:
- Label: "Unscheduled ({count})" with a muted subheading "Drag onto a lane to schedule"
- Each card is draggable (same `onDragStart` pattern setting `assetId`)
- Cards show title, asset_type badge, and status border color
- Styled as a flex-wrap row with a dashed border

**4. Keep existing drop handlers**
The `handleDrop` function already works — it calculates the date from drop position and updates `publish_date` in Supabase. No changes needed there.

### Visual layout

```text
┌─────────────────────────────────────────┐
│  Summary bar (touchpoints, gaps, etc.)  │
├─────────────────────────────────────────┤
│  Awareness │ Nurture │ Conversion       │
├─────────────────────────────────────────┤
│  Week markers + swimlane timeline       │
│  (LinkedIn, Email, etc. with cards)     │
├─────────────────────────────────────────┤
│  Unscheduled (5)                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│  │Blog  │ │Email │ │Video │ │Post  │   │
│  └──────┘ └──────┘ └──────┘ └──────┘   │
│  Drag onto a lane above to schedule     │
└─────────────────────────────────────────┘
```

## Files changed
1. `src/components/campaigns/CampaignJourneyView.tsx` — add unscheduled tray, remove minimum threshold

