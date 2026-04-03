

# Fix Campaign Wizard: Early Save + Conversation Length

## Problems
1. **No way to save mid-session** — the "Save Campaign" button requires `is_complete`, so users can't save progress during long builds
2. **Conversations grow unbounded** — every message is sent to Anthropic, hitting token limits and causing timeouts/incomplete responses

## Solution

### 1. Add "Save Draft" button (always enabled)
In `CampaignPreviewPanel.tsx`, add a second button "Save Draft" that saves the current draft state to the `campaigns` table with `status: 'brief'` even when `is_complete` is false. The existing "Save Campaign" becomes "Finalize Campaign" for completed drafts.

**File: `src/components/campaign-wizard/CampaignPreviewPanel.tsx`**
- Add `onSaveDraft` prop
- Render "Save Draft" button (always enabled when there's any draft content like a name or track)
- Rename existing save to "Finalize Campaign"

**File: `src/pages/CampaignWizard.tsx`**
- Add `saveDraft` handler that upserts to `campaigns` table with current draft state (doesn't require `is_complete`)
- Track a `campaignId` in state so subsequent saves update rather than insert
- Wire to preview panel

### 2. Sliding window for conversation history
In `supabase/functions/campaign-wizard/index.ts`, instead of sending ALL messages to Anthropic:
- Always include the first 2 messages (initial context)
- Send only the last 10 messages (5 exchanges)
- Inject the current `draft_output` as a system prompt section so the AI always knows the current state even without full history
- Increase `max_tokens` to 4096 to give the AI room to complete drafts

**File: `supabase/functions/campaign-wizard/index.ts`**
- Add sliding window: keep first 2 + last 10 messages for Anthropic call
- Add current draft state to system prompt: `## CURRENT DRAFT STATE\n{JSON}`
- Bump `max_tokens` from 2048 to 4096

### 3. Files Changed
| File | Action |
|------|--------|
| `src/components/campaign-wizard/CampaignPreviewPanel.tsx` | Add Save Draft button + onSaveDraft prop |
| `src/pages/CampaignWizard.tsx` | Add saveDraft handler, track campaignId for upserts |
| `supabase/functions/campaign-wizard/index.ts` | Sliding window + draft in system prompt + higher max_tokens |

