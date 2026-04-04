

# Journey View Tab for Campaign Detail Page

## Overview
Add a tabbed layout to the campaign detail page with "Asset Pipeline" (existing kanban) and a new "Journey View" tab. The Journey View plots content assets on a horizontal timeline grouped by channel swimlanes, with gap detection, journey stage overlay, and summary stats.

## Changes

### 1. New component: `src/components/campaigns/CampaignJourneyView.tsx`

A self-contained component receiving `campaign: Campaign`, `assets: CampaignAsset[]`, and callbacks for opening the asset drawer and creating new assets.

**Summary bar** — Four stat chips at top:
- Total touchpoints (assets with publish_date)
- Avg days between touchpoints
- Longest gap (red text if >14 days)
- 95-5 balance based on campaign track

**Journey stage overlay** — Thin horizontal band above swimlanes showing Awareness (blue) / Nurture (purple) / Conversion (green). Widths weighted by `campaign.track`: demand_creation weights awareness+nurture wider; demand_capture weights conversion wider.

**Horizontal timeline** — X axis from `launch_date` to `end_date` with week tick marks. Built with CSS positioning (percentage-based left offsets within a relative container).

**Swimlanes** — Five labelled rows:
- LinkedIn (`linkedin_post`)
- Email (`email`)
- Whitepaper / Report (`whitepaper`, `press_release`)
- Webinar / Event (`webinar`, `video`, `podcast`)
- Other (`blog` and anything else)

Each asset card (120px wide) is positioned horizontally by `publish_date`. Cards show: truncated title, status badge (border colour matching status), asset type icon. Click opens asset detail drawer.

**Gap detection** — Within each swimlane, sort assets by date and check consecutive gaps. If >14 days, render a dashed-border placeholder card at the midpoint showing "⚠️ Gap: N days" and "+ Add content" button. Clicking pre-fills channel and suggested date, then opens asset creation flow.

**Cross-channel gaps** — Merge all dated assets, sort, find the longest period with no content. If >7 days, render a vertical red semi-transparent band spanning all swimlanes with "No touchpoints" label.

**Drag to reschedule** — Use native HTML drag (onDragStart/onDrop) on asset cards. On drop, calculate new date from X position, update `publish_date` via `supabase.from('campaign_assets').update(...)`, then refresh.

**Empty state** — If fewer than 3 assets have publish_date, show message + button to switch back to Pipeline tab.

### 2. Modify: `src/pages/Campaigns.tsx`

Wrap the campaign detail view content (below the bulk actions toolbar) in a `<Tabs>` component with two tabs:

- **Asset Pipeline** — contains the existing CampaignTimeline, CampaignMetricsSummary, and kanban grid (moved as-is)
- **Journey View** — renders `<CampaignJourneyView>`

Import `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs`.

The header, objective card, bulk actions toolbar, and AssetDetailDrawer remain outside the tabs (shared).

### 3. Asset type to swimlane mapping

```text
linkedin_post        → LinkedIn
email                → Email
whitepaper, press_release → Whitepaper / Report
webinar, video, podcast   → Webinar / Event
blog (+ any other)        → Other
```

## Technical details

- Timeline positioning: `left: ((assetDate - startDate) / (endDate - startDate)) * 100%`
- Week markers: iterate from start to end in 7-day increments
- Journey stage widths: demand_creation → 40% / 40% / 20%; demand_capture → 20% / 30% / 50%; default → 33% / 33% / 34%
- Gap calculation: sort dated assets per swimlane, diff consecutive dates in days
- Cross-channel gap: merge all dated assets into one sorted array, find max consecutive gap
- Drag reschedule: `onDragEnd` computes new percentage position → new date, writes to Supabase
- No new DB tables or migrations needed
- Horizontal scroll container for campaigns spanning many weeks

## Files
1. `src/components/campaigns/CampaignJourneyView.tsx` — new (main component)
2. `src/pages/Campaigns.tsx` — add tabs wrapping existing content + new Journey View tab

