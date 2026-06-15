## What I found

Confirmed in the database for the ProPresence project:

- **Saved ICPs (table `icps`)**: 1 row — "Startup Founders — Founder-Led Marketing", Australia. `fit_score`/`access_score` are both 5 (defaults — looks like the row was inserted before scoring was finished).
- **ICP wizard sessions (table `wizard_sessions`)** for ProPresence — 3 total:
  1. 13:26 — "Startup Founders — Founder-Led Marketing", geography `Australia (Sydney-based, likely ANZ initially)`, `is_complete: false`, status `complete`.
  2. 14:17 — "Australian Early-Stage Founders", geography `Australia`, `is_complete: true`, status `complete`. **Not saved to the `icps` table.**
  3. 14:29 — empty draft, status `in_progress` (new session you have open now).
- **No US-based segment exists in any project**, in either `icps` or `wizard_sessions` (I searched all geography fields, segment names, and full draft text for "US", "United States", "America"). The notes in the Australian draft explicitly say "Australian founders mirror US founder ICP" — which suggests a US-based segment was discussed in chat but never persisted.

So we have two distinct issues:

1. **The "Australian Early-Stage Founders" segment was never saved** to the `icps` table even though the wizard marked the session complete. That's recoverable from `wizard_sessions.draft_output`.
2. **The US-based segment has no record at all** — no session, no draft, no row. Most likely it lived only inside the chat transcript of one of the existing sessions (and was overwritten when you continued shaping into the Australian version), or the session was never created due to an init failure. Without a session record there's nothing to restore.

## Plan

### Step 1 — Recover the "Australian Early-Stage Founders" ICP
Insert a new row into `icps` from `wizard_sessions.draft_output` of session `c746a7cb-3693-4ef8-a439-5f980385e172` (segment name, firmographics, psychographics, fit/access score, matrix category, anti-ICP signals, buyer-role behaviour). I'll show you the values before insert so you can confirm.

### Step 2 — Try to recover the US-based segment
- Search the full chat transcript (`wizard_sessions.messages`) of all three ProPresence sessions for any US/American/United-States content the AI drafted. If a usable US draft is in there, I'll reconstruct it into an `icps` row.
- If nothing US-related is in any transcript, the segment is unrecoverable and you'll need to rebuild it. (I'll tell you straight away rather than fish further.)

### Step 3 — Fix the save bug so this stops happening
Audit the ICP wizard save path:
- `src/pages/ICPWizard.tsx` — does the "Save" button always call `supabase.from('icps').insert(...)`? Are errors swallowed (no `toast.error`)? Does completing a session via the AI auto-save, or does it only mark `wizard_sessions.status = 'complete'` and rely on the user pressing Save?
- `supabase/functions/icp-wizard/index.ts` — when the AI marks `is_complete: true`, does it persist the ICP row, or just the draft on the session?

Likely fix (subject to confirming in code): on session completion, if no `icps` row exists for this session, persist one server-side as part of the same edge-function transaction, and surface a clear success/failure toast in the UI. Also keep the "Save" button as an explicit fallback.

### Step 4 — Make sessions easier to recover in the future
Add a small "Resume previous ICP drafts" affordance on the ICP & Personas page that lists `wizard_sessions` where `session_type='icp'` and `is_complete=true` but no matching `icps` row, with one-click "Save this draft" — turning silent losses into one-click recoveries.

## Technical notes

- Recovery in Step 1/2 is data-only — I'll use the insert tool, not a migration.
- Step 3 schema-wise needs no migration; it's edge-function + UI code.
- Step 4 is optional polish; happy to skip if you'd rather just have the bug fixed.

## Out of scope

- I will not delete or rewrite the existing saved "Startup Founders — Founder-Led Marketing" ICP unless you ask — it appears to be a partial save you may still want.
- I will not change the persona schema or the persona wizard; this is all in ICP territory.
