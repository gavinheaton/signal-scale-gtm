

# Campaign Wizard Page

## Overview
Create a new `CampaignWizard` page with the same 60/40 chat+preview layout as `ICPWizard`. The "+ New Campaign" button on the Campaigns page will fetch ICP/persona data and navigate to the wizard. The right panel shows campaign-specific preview sections, a content calendar table, and a 95-5 balance bar.

## Files to Create/Modify

### 1. `src/pages/CampaignWizard.tsx` (new)
Mirrors `ICPWizard.tsx` structure with these differences:

- **On mount**: fetch ICPs and personas for the project, pass as `project_context` when invoking `campaign-wizard` edge function to create session
- **Chat panel** (left 60%): identical pattern — messages, markdown rendering, input box
- **Preview panel** (right 40%): uses new `CampaignPreviewPanel` component
- **Save handler**: inserts into `campaigns` table + bulk inserts `campaign_assets` from `draft.content_calendar` array
- **Notion button**: renders "View Brief in Notion" link when `notion_url` is returned

### 2. `src/components/campaign-wizard/CampaignPreviewPanel.tsx` (new)
Right-side panel showing:

- **Campaign name** at top (editable input, bound to `draft.campaign_name`)
- **Track badge**: orange "Demand Capture (5%)" or purple "Demand Creation (95%)" once `draft.track` is set
- **6 completion cards**: Target Audience, Campaign Insight, Objective, Channel Mix, Content Calendar, Success Metrics — each shows filled/empty state based on draft keys
- **Content Calendar table**: compact table with columns: Asset Title, Format, Persona, Week — populated from `draft.content_calendar[]`
- **95-5 Balance bar**: horizontal split showing demand_creation vs demand_capture percentage of content calendar assets, purple/orange
- **Save Campaign button**: disabled until `draft.is_complete === true`
- **View Brief in Notion button**: shown when `notion_url` is set, opens in new tab

### 3. `src/components/campaign-wizard/types.ts` (new)
```typescript
export interface CampaignDraft {
  campaign_name?: string;
  track?: 'demand_capture' | 'demand_creation';
  target_audience?: Record<string, any>;
  campaign_insight?: Record<string, any>;
  objective?: Record<string, any>;
  channel_mix?: Record<string, any>;
  content_calendar?: ContentCalendarItem[];
  success_metrics?: Record<string, any>;
  is_complete?: boolean;
  notion_brief_ready?: boolean;
  sections_complete?: string[];
}

export interface ContentCalendarItem {
  title: string;
  format: string;
  persona: string;
  week: string;
  track?: 'demand_capture' | 'demand_creation';
}

export const CAMPAIGN_SECTIONS = [
  { key: 'target_audience', label: 'Target Audience', icon: '🎯' },
  { key: 'campaign_insight', label: 'Campaign Insight', icon: '💡' },
  { key: 'objective', label: 'Objective', icon: '📌' },
  { key: 'channel_mix', label: 'Channel Mix', icon: '📡' },
  { key: 'content_calendar', label: 'Content Calendar', icon: '📅' },
  { key: 'success_metrics', label: 'Success Metrics', icon: '📊' },
];
```

### 4. `src/pages/Campaigns.tsx` (modify)
- Change "+ New Campaign" button to navigate to `/project/campaign-wizard` instead of opening the Sheet form
- Remove the Sheet form (campaign creation now handled by wizard)

### 5. `src/App.tsx` (modify)
- Add route: `<Route path="/project/campaign-wizard" element={<CampaignWizard />} />`
- Import `CampaignWizard`

### 6. `src/types/database.ts` (modify)
- Add `'campaign'` to `WizardSessionType`

## Save Logic (in CampaignWizard)
When user clicks "Save Campaign":
1. Insert into `campaigns`: project_id, name from draft, track, status='brief', objective, channel_mix, target_icp_ids (from draft.target_audience)
2. For each item in `draft.content_calendar`, insert into `campaign_assets`: campaign_id, title, asset_type (mapped from format), status='brief', persona_target_ids
3. Mark wizard_session as complete

## No database changes needed
All required columns (`context`, `notion_url`, `campaign` enum value) were added in the previous migration.

