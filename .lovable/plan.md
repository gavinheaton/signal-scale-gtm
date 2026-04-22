

# Fix JSON Leaking into Campaign Wizard Chat

## Root cause

The Campaign Wizard AI sometimes produces draft outputs so large that the response is **truncated at the 4096-token cap before the closing `</draft>` tag is emitted**. The cleanup regex (`<draft>[\s\S]*?</draft>`) requires a matching close tag, so when it's missing the entire JSON payload — plus its ```json fences — leaks straight into the chat bubble.

Confirmed in the database: at least two recent assistant messages (~15K chars each) start with `<draft>` at offset ~400–900 but contain NO closing tag. Those are exactly what the user is seeing as "JSON and HTML" in the feed.

A secondary issue: the regex is non-global, so if the AI ever emits two draft blocks in one reply, the second leaks too.

## Fix

### 1. Bullet-proof the cleanup (both server and client)

Replace the strict pair-matching regex with a multi-pass strip that handles:
- normal `<draft>…</draft>` pairs (current case, works)
- a lone `<draft>` with no closer — strip from the tag to end of message
- multiple draft blocks — global flag
- bare ```json … ``` fences that occasionally appear outside `<draft>` tags

Apply this in two places so neither layer leaks:

**`supabase/functions/campaign-wizard/index.ts`** — replace the single-line strip with a `stripDraft()` helper used for `cleanReply` (returned to the client) AND for the messages stored in `wizard_sessions.messages` so historical sessions stay clean on resume.

**`src/pages/CampaignWizard.tsx`** — replace the existing `replace(/<draft>[\s\S]*?<\/draft>/g, '')` in `initSession` with the same helper (extract to `src/lib/stripDraft.ts` and import in both the page and any other wizard that needs it — ICP and BrandVoice wizards use the same pattern).

### 2. Increase the token cap + ask the model to be terser inside `<draft>`

The 15K-char drafts that triggered truncation contained a 24-item content calendar with verbose rationales. Two changes prevent recurrence:

- Bump `max_tokens` from 4096 to 8192 in `campaign-wizard/index.ts` (Sonnet 4 supports it; cost impact minimal because we rarely hit the cap).
- Add a line to the draft-format instructions: *"Keep `rationale` fields under 150 characters. If the calendar exceeds 20 items, group into phases instead of listing every item."*

### 3. Repair the two corrupted sessions in the database

Run a one-off update to strip the orphan `<draft>` payloads from `wizard_sessions.messages` for the two affected campaign sessions, so when the user resumes them the chat re-renders cleanly. (Pure data fix — no schema change.)

## Files changed

1. **`src/lib/stripDraft.ts`** — new shared helper
2. **`src/pages/CampaignWizard.tsx`** — use helper in `initSession`
3. **`src/pages/ICPWizard.tsx`** + **`src/pages/BrandVoiceWizard.tsx`** — same helper (defensive, identical pattern)
4. **`supabase/functions/campaign-wizard/index.ts`** — use helper, raise `max_tokens` to 8192, add brevity instruction
5. **Migration / one-off update** — sanitize the two existing corrupted `wizard_sessions.messages` rows

## Helper logic (technical)

```ts
// src/lib/stripDraft.ts
export function stripDraft(text: string): string {
  if (!text) return text;
  let out = text;
  // 1. Strip well-formed <draft>...</draft> blocks (greedy across multiples)
  out = out.replace(/<draft>[\s\S]*?<\/draft>/g, '');
  // 2. Strip orphan <draft> with no closer — everything from the tag to end
  out = out.replace(/<draft>[\s\S]*$/g, '');
  // 3. Strip stray ```json ... ``` fences that sometimes appear outside <draft>
  out = out.replace(/```json[\s\S]*?```/g, '');
  // 4. Strip orphan ```json with no closer
  out = out.replace(/```json[\s\S]*$/g, '');
  return out.trim();
}
```

No new dependencies, no UI changes beyond clean text rendering.

