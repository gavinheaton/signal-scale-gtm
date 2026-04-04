

# Campaign Dashboard Visualization

## What we're building

A rich campaign detail view that replaces the current bare kanban with a full dashboard inspired by your reference image. Three sections stacked vertically:

### 1. Campaign Timeline Bar
A horizontal progress bar spanning `launch_date` → `end_date`, showing where "today" falls. Three shaded phases (Foundation & Drafting, Review & Approval, Publishing & Lead Gen) derived by splitting the date range into thirds. Milestone dots for assets with `publish_date` values plotted along the timeline.

### 2. Enhanced Asset Pipeline Kanban
Keep the existing 5-column layout (Brief → Draft → Review → Approved → Published) but add:
- Colored column headers with chevron arrows between them (matching your reference: gray → blue → amber → green → teal)
- Richer cards: show asset type badge, status badge, content indicator, Notion sync indicator, and `publish_date` if set
- Visual flow: subtle gradient/arrow connectors between columns

### 3. Campaign Metrics Summary
A row of stat cards below the kanban:
- **Assets Published**: count of `status === 'published'`
- **Content Pipeline Progress**: percentage of assets past `brief` status, shown as a donut/ring
- **Assets with Content**: count where `content` is not null
- **Notion Synced**: count where `notion_url` is set
- **Status Breakdown**: mini horizontal stacked bar showing brief/draft/review/approved/published proportions

All data is already available from `campaign_assets` and `campaigns` — no new API calls or DB changes needed.

## Files changed

1. **`src/components/campaigns/CampaignTimeline.tsx`** (new) — horizontal date bar with phase labels and asset milestone dots
2. **`src/components/campaigns/CampaignMetricsSummary.tsx`** (new) — row of stat cards with counts and a progress ring
3. **`src/pages/Campaigns.tsx`** — import and render the two new components in the campaign detail view, between the bulk actions toolbar and the kanban. Upgrade kanban column headers with color styling and arrow connectors.

## Technical details

- Timeline phases calculated by dividing `(end_date - launch_date)` into thirds
- "Today" marker positioned as `(today - launch_date) / (end_date - launch_date) * 100%`
- Progress ring uses a simple SVG `circle` with `stroke-dasharray` — no charting library needed
- Stacked bar is a flex row with colored segments proportional to asset counts per status
- All components are pure presentational — they receive `campaign` and `assets` as props
- Responsive: timeline and metrics cards stack on mobile

