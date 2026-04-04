

# Bulk Generate & Push to Notion by Campaign

## How It Works

When viewing a campaign's detail page, the user sees two new campaign-level action buttons alongside the existing per-asset actions:

1. **"Generate All Content"** — Iterates through all assets in the campaign that are still in `brief` status, generates content for each using the existing `generate-campaign-content` edge function, and updates them to `draft`. A progress indicator shows "Generating 3/8..." as it works through the queue.

2. **"Push All to Notion"** — Takes all assets that have content (status `draft` or later) and creates a single Notion page per campaign containing all assets as sections, or individual child pages under the campaign brief. A progress indicator shows push status.

Both operations are sequential server-side to avoid rate limits but feel async to the user via a progress bar.

## Changes

### 1. New Edge Function: `bulk-generate-campaign-content`

- Accepts `campaign_id`
- Fetches all `campaign_assets` in `brief` status for that campaign
- For each asset: fetches campaign context, brand voice, and relevant personas, then calls Claude to generate content tailored to the asset type
- Updates each asset's `content` column and sets status to `draft`
- Returns a summary: `{ generated: 5, failed: 0, results: [...] }`
- Uses streaming responses or batched processing with a reasonable timeout

### 2. New Edge Function: `bulk-push-campaign-to-notion`

- Accepts `campaign_id`
- Fetches the campaign and all assets that have `content` (non-null)
- Creates a single Notion page (child of the campaign briefs parent page) titled with the campaign name
- Each asset becomes a section on that page: heading with title + asset type, then the content formatted as Notion blocks
- Returns `{ notion_url, assets_pushed: 5 }`
- Stores the URL on the campaign's wizard session or a new `notion_url` column

### 3. Database Migration

- Add `content text` and `notion_url text` columns to `campaign_assets`
- Add UPDATE + DELETE RLS policies on `campaign_assets` (currently missing)
- Add `notion_url text` column to `campaigns` table for the bulk-pushed page URL

### 4. Campaign Detail View (`src/pages/Campaigns.tsx`)

Add a toolbar in the campaign detail view with:
- **"Generate All Content"** button — disabled if no assets in `brief` status, shows progress during generation
- **"Push to Notion"** button — disabled if no assets have content, shows progress during push, opens Notion link when complete
- Per-asset status badges (colour-coded) on each asset card
- Per-asset "Generate" and "Push" buttons in the asset drawer (from the original plan)

### 5. Asset Detail Drawer (`src/components/campaigns/AssetDetailDrawer.tsx`)

Side drawer when clicking an asset card:
- Shows title, type, status, generated content (markdown preview)
- Individual "Generate", "Regenerate", "Push to Notion" buttons
- Status change dropdown

## Files

| File | Action |
|------|--------|
| Migration SQL | Add `content`, `notion_url` to `campaign_assets`; `notion_url` to `campaigns`; UPDATE/DELETE RLS policies |
| `supabase/functions/generate-campaign-content/index.ts` | New — single asset content generation |
| `supabase/functions/bulk-generate-campaign-content/index.ts` | New — loops through all brief-status assets |
| `supabase/functions/bulk-push-campaign-to-notion/index.ts` | New — creates one Notion page with all asset content |
| `supabase/functions/push-asset-to-notion/index.ts` | New — single asset push |
| `src/pages/Campaigns.tsx` | Add bulk action toolbar, status badges, asset click handler |
| `src/components/campaigns/AssetDetailDrawer.tsx` | New — individual asset detail + actions |

## UX Flow

```text
Campaign Detail View
┌─────────────────────────────────────────┐
│ ← Back    Campaign Name    [Track]      │
│                                         │
│ [Generate All Content] [Push to Notion] │
│  ◻ 3 assets ready    ◻ View in Notion  │
│                                         │
│ Brief  │ Draft  │ Review │ Approved │...│
│ ┌────┐ │ ┌────┐ │        │          │   │
│ │Blog│ │ │Post│ │        │          │   │
│ │ 🔵 │ │ │ 🟢 │ │        │          │   │
│ └────┘ │ └────┘ │        │          │   │
└─────────────────────────────────────────┘
         Click asset → Drawer opens →
┌──────────────────┐
│ Blog Post Title  │
│ Status: Draft    │
│ ──────────────── │
│ [content preview]│
│ [Regenerate]     │
│ [Push to Notion] │
└──────────────────┘
```

