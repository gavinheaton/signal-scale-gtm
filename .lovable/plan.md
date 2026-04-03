

# Fix Campaign Section Completion Detection

## Problem
Sections like Target Audience, Objective, and Campaign Insight have data in the draft but never show as "complete" (green checkmark). The `getCampaignSectionStatus` function only marks a section complete if the AI explicitly adds its key to a `sections_complete[]` array — which the AI rarely does. So sections stay at "partial" forever.

## Solution

### 1. Auto-detect completion from draft data (`src/components/campaign-wizard/types.ts`)
Update `getCampaignSectionStatus` to infer completion from the data itself instead of relying solely on `sections_complete[]`:

- **target_audience**: complete if it has `icp_ids` or `personas` with at least one entry
- **campaign_insight**: complete if it has a non-empty string value (or object with a `text`/`insight` key)
- **objective**: complete if it has a non-empty string or object with content
- **channel_mix**: complete if it has at least one channel key
- **content_calendar**: complete if array has 3+ items
- **success_metrics**: complete if it has `primary` or `secondary` keys

The `sections_complete[]` from the AI still works as an override — if the AI marks it complete, it stays complete. But now sections can also auto-complete based on data richness.

### 2. Add draft instructions to system prompt (`supabase/functions/campaign-wizard/index.ts`)
Append explicit instructions to the system prompt telling the AI about the `sections_complete` array and the expected draft structure. This ensures the AI also tries to set `sections_complete` when appropriate, as a belt-and-suspenders approach alongside auto-detection.

Add to the system prompt (after the CURRENT DRAFT STATE block):
```
## DRAFT FORMAT INSTRUCTIONS
Always include a <draft> tag with JSON. Include sections_complete array listing completed section keys: target_audience, campaign_insight, objective, channel_mix, content_calendar, success_metrics. Mark a section complete once you have gathered enough information for it.
```

### Files Changed
| File | Change |
|------|--------|
| `src/components/campaign-wizard/types.ts` | Smarter `getCampaignSectionStatus` with data-based completion detection |
| `supabase/functions/campaign-wizard/index.ts` | Add draft format instructions to system prompt |

