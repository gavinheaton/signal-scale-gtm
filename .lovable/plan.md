# Resumable Brand Voice Wizard

The wizard already writes `messages` and `draft_output` to `wizard_sessions` after each AI turn, and `initSession` will pick up an in-progress session on load. Three gaps remain that cause people to lose work or not realise progress was saved:

1. If a user sends a message and closes the tab before the AI response returns, **their message is never persisted** (the edge function only writes back after the model replies).
2. There is no visible "saved" cue, so users don't trust they can leave.
3. There is no entry point to resume from outside the wizard — the Brand Voice landing page (`/project/brand-voice`) doesn't show in-progress sessions, so users start fresh from the sidebar and only discover the resume via a toast once inside.

## Changes

**1. Persist the user message immediately (edge function)**
- In `supabase/functions/brand-voice-wizard/index.ts`, add an early `update` to `wizard_sessions.messages` right after appending the user message (line ~358), before the Anthropic call. If the model call fails, the user's message is still there on next load.
- Also bump an `updated_at` so we can show a "last saved" time.

**2. Visible auto-save indicator (wizard UI)**
- In `src/pages/BrandVoiceWizard.tsx`, track `lastSavedAt` (set from the edge function response, and from the early-save above via the existing response payload — return `saved_at` from the function).
- Show a small "Saved · 2s ago" label next to the header, updating every 30s via `useEffect` + `setInterval`.
- Add `beforeunload` warning only while a request is mid-flight.

**3. Resume entry point on Brand Voice landing page**
- In `src/pages/BrandVoice.tsx`, query `wizard_sessions` for `session_type='brand_voice'`, `status='in_progress'`, current project. If one exists, show a banner card: "You have a brand voice in progress" with **Resume** (→ `/project/brand-voice/wizard`) and **Discard** (sets `status='cancelled'`) actions.
- The wizard's existing `initSession` already loads the in-progress session, so Resume needs no new wiring.

**4. Resume toast → confirm dialog**
- Replace the silent `toast.info('Resumed your previous session')` with an inline banner inside the wizard showing how many messages and which sections are already filled, with a **Start over** action wired to the existing `startOver()`.

## Out of scope
- No schema changes — `wizard_sessions` already stores everything needed.
- No changes to ICP / Persona wizards in this pass (same pattern can be applied later).
