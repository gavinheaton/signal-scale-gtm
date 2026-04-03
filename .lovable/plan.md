

# Fix ICP Wizard: Storage, Save Flow, and AI Awareness

## Root Causes

1. **Claude says "I can't save"** — The system prompt never tells Claude that the draft JSON is automatically persisted. Claude thinks it's just chatting with no backend integration.
2. **Draft JSON parsing fails** — Edge function logs show `Failed to parse draft JSON`. When Claude outputs malformed JSON (trailing commas, comments, etc.), the draft stays empty `{}` and the save button never enables.
3. **Save requires `is_complete === true`** — Users can't save partial progress or override. If Claude never sets the flag (or draft parsing fails), the button stays permanently disabled.
4. **Rate limits** — The fetched website content (up to 8000 chars) plus the system prompt and conversation history pushes past the 10,000 input token/minute rate limit. Need to trim context.

## Changes

### 1. Edge function: `supabase/functions/icp-wizard/index.ts`

**System prompt update** — Add explicit instructions that:
- The draft JSON is automatically saved to the database after every exchange
- When all 6 sections are complete, the user can save the ICP to the platform with one click
- Claude should proactively tell the user "Your ICP is ready — click Save to Platform on the right panel" when complete
- Remove any ambiguity about saving capability

**Robust draft parsing** — When JSON.parse fails:
- Strip common issues: trailing commas, JS-style comments, control characters
- Try parsing again after cleanup
- If still failing, preserve the previous draft from the session rather than returning `{}`
- Log the raw draft string for debugging

**Context trimming** — Reduce fetched URL content from 8000 to 4000 chars to stay under rate limits. Also trim the system prompt slightly.

**Merge drafts** — Instead of replacing the entire draft with each response, deep-merge the new draft with the existing one so partial parse failures don't wipe progress.

### 2. Frontend: `src/pages/ICPWizard.tsx`

**Always-available save** — Change save button to have two states:
- Complete: "Save ICP to Platform" (primary, pulsing)  
- Partial (at least 1 section has data): "Save Draft to Platform" (secondary, enabled)
- Empty: disabled

**Error handling** — Show a toast with the actual Supabase error if save fails, and don't trigger the success animation unless the insert actually succeeded.

**Resume sessions** — On init, check for an existing `in_progress` wizard session for this project and resume it instead of always creating a new one, so progress isn't lost.

### 3. Preview panel: `src/components/icp-wizard/ICPPreviewPanel.tsx`

**Two save buttons** — When not complete, show "Save Draft" (outlined) that saves whatever exists. When complete, show the full "Save to Platform" CTA.

**Handle partial data gracefully** — The `saveICP` function should work even with incomplete sections, defaulting missing scores and matrix_category.

### 4. Edge function draft merging logic

When the new draft from Claude only has partial sections, merge it with the existing `draft_output` from the session so that previously captured data isn't lost on a parse failure.

## Files to modify

- `supabase/functions/icp-wizard/index.ts` — System prompt, draft parsing robustness, context trimming, draft merging
- `src/pages/ICPWizard.tsx` — Resume sessions, partial save support, error handling
- `src/components/icp-wizard/ICPPreviewPanel.tsx` — Enable save at partial completion

## No database changes needed

The existing `wizard_sessions` and `icps` tables already support everything needed.

