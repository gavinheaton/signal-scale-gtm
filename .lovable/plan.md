

# Auto-Update Methodology Progress from Actual Data

## Problem
The `methodology_progress` field on the `projects` table is never updated. It stays at the default (`not_started` for all 8 phases) regardless of how many ICPs, personas, campaigns, or assets exist. The Home page reads this stale data and shows everything as "not started."

## Solution
Instead of relying on a manually-maintained JSON field, **compute methodology progress dynamically** on the Home page based on actual data counts. This is more reliable than trying to patch every wizard/creation flow to write back to the field.

### Phase → data mapping

| Phase | Data source | not_started | in_progress | complete |
|-------|-----------|-------------|-------------|----------|
| ICP | `icps` count for project | 0 ICPs | ≥1 ICP but no complete wizard session | ≥1 ICP with complete wizard session |
| Personas | `personas` count | 0 | ≥1 persona | ≥3 personas |
| Customer Conversations | No table yet | Always not_started | — | — |
| Competitor Mapping | No table yet | Always not_started | — | — |
| Ecosystem Map | No table yet | Always not_started | — | — |
| Value Proposition | `brand_voices` status | No brand voice | status = in_progress | status = complete |
| Campaign Strategy | `campaigns` count | 0 | ≥1 campaign in brief/planning | ≥1 active/complete campaign |
| Execution | `campaign_assets` count | 0 | ≥1 asset | ≥1 published asset |

### Implementation

**File: `src/pages/Home.tsx`**

1. Add queries in the existing `useEffect` to fetch the additional counts needed (brand voice status, asset statuses, campaign statuses, wizard session completions).

2. Add a `computedProgress` function that derives each phase status from real data using the mapping above — replacing the read from `currentProject.methodology_progress`.

3. Optionally persist: after computing, if the computed progress differs from the stored value, fire a single `supabase.from('projects').update({ methodology_progress: computed })` call. This keeps the DB in sync for other consumers without being the source of truth for the UI.

### Changes
1. **`src/pages/Home.tsx`** — add data queries, compute progress dynamically, optionally sync back to DB

### Technical detail

```typescript
// New state
const [brandVoiceStatus, setBrandVoiceStatus] = useState<string | null>(null);
const [campaignStatuses, setCampaignStatuses] = useState<string[]>([]);
const [assetStatuses, setAssetStatuses] = useState<string[]>([]);
const [icpWizardComplete, setIcpWizardComplete] = useState(false);

// In useEffect, add:
supabase.from('brand_voices').select('status').eq('project_id', pid).limit(1).single()
  .then(({ data }) => setBrandVoiceStatus(data?.status || null));

supabase.from('wizard_sessions').select('status')
  .eq('project_id', pid).eq('session_type', 'icp').eq('status', 'complete')
  .then(({ data }) => setIcpWizardComplete((data?.length || 0) > 0));

// Compute progress
function derivePhaseStatus(): Record<string, string> {
  return {
    icp: icpCount === 0 ? 'not_started' : icpWizardComplete ? 'complete' : 'in_progress',
    personas: personaCount === 0 ? 'not_started' : personaCount >= 3 ? 'complete' : 'in_progress',
    customer_conversations: 'not_started',
    competitor_mapping: 'not_started',
    ecosystem_map: 'not_started',
    value_proposition: !brandVoiceStatus ? 'not_started' : brandVoiceStatus === 'complete' ? 'complete' : 'in_progress',
    campaign_strategy: activeCampaigns.length === 0 ? 'not_started' : 
      activeCampaigns.some(c => ['active','complete'].includes(c.status)) ? 'complete' : 'in_progress',
    execution: assetStatuses.length === 0 ? 'not_started' :
      assetStatuses.includes('published') ? 'complete' : 'in_progress',
  };
}
```

No migration needed — the existing `methodology_progress` column stays; we just stop relying on it as the sole source of truth.

