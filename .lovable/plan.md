

# Create Notion Campaign Brief Edge Function

## Overview
Create `supabase/functions/create-notion-campaign-brief/index.ts` that receives a campaign draft and creates a richly formatted Notion page. Two new secrets are needed.

## Secrets Required
- **NOTION_API_KEY** — Notion integration token
- **NOTION_CAMPAIGN_BRIEFS_PAGE_ID** — Parent page ID where briefs are created

## Edge Function: `supabase/functions/create-notion-campaign-brief/index.ts`

**Input**: `{ campaign_draft, project_name, org_name }` (called internally by `campaign-wizard` with service role key)

**Logic**:
1. Validate input (campaign_draft required)
2. Build Notion `pages.create` payload:
   - **Parent**: `NOTION_CAMPAIGN_BRIEFS_PAGE_ID` (as page parent)
   - **Title**: `campaign_draft.campaign_name`
   - **Properties**: Track, Objective (from `campaign_draft.objective`), org/project name in subtitle
   - **Body blocks** (children array):
     * Heading "The Insight" + paragraph from `campaign_draft.campaign_insight`
     * Heading "Campaign Objective" + paragraph from `campaign_draft.objective`
     * Heading "Key Message" + callout block
     * Heading "Channel Plan" + bulleted list items from `campaign_draft.channel_mix`
     * Heading "Content Calendar" + table block with columns: Title, Format, Persona, Track, Week, Purpose — rows from `campaign_draft.content_calendar`
     * Heading "Success Metrics" + two-column layout (Primary / Secondary)
     * Heading "95-5 Balance" + paragraph with demand creation vs capture percentages
     * Heading "What to Avoid" + bulleted list from `campaign_draft.anti_patterns`
3. POST to `https://api.notion.com/v1/pages` with Notion API v2022-06-28
4. Return `{ notion_url: response.url }`

**Note on caller**: The `campaign-wizard` function currently passes `{ session_id, project_id, draft, context }`. We'll update that call to also pass `project_name` and `org_name`, or extract them from context. The function will be flexible — accepting `draft` or `campaign_draft` as the key.

## Config Update: `supabase/config.toml`
Add:
```toml
[functions.create-notion-campaign-brief]
  verify_jwt = false
```

## Files
- **Create**: `supabase/functions/create-notion-campaign-brief/index.ts`
- **Edit**: `supabase/config.toml` — add function entry
- **Edit**: `supabase/functions/campaign-wizard/index.ts` — update the internal call to pass `campaign_draft`, `project_name`, `org_name`

