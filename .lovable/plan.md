## Problem

The ICP diff-mode intro ("I see you already have N ICPs — is this a variation or a different segment?" + quick-reply chips) only fires when a **brand new** wizard session is created. In practice users hit it rarely because:

1. **`ICPWizard.tsx` auto-resumes any in-progress session.** On mount, `initSession()` looks for the most recent `wizard_sessions` row with `session_type='icp'` and `status='in_progress'` and replays its stored messages. That session was likely started *before* the first ICP was saved, so its opening message is the generic "what's your website URL?" — the diff-mode branch on the server never gets to run for that session.
2. **Saving an ICP doesn't cancel any other in-progress ICP sessions.** `saveICP` only marks the current `sessionId` as `complete`. Any older stray in-progress sessions remain and get resumed next visit.
3. **Even a fresh visit after saving** can resume the just-completed flow's sibling session (created earlier in the day) instead of starting clean, so the "prior ICPs" prompt is skipped.

Net effect: diff mode is coded correctly on the edge function, but the client rarely triggers a new session, so the user never sees it.

## Fix

Make the client always evaluate diff mode against current ICP state, and give the server a way to refresh a resumed session's opening turn.

### 1. `src/pages/ICPWizard.tsx` — smarter session resume

- Before deciding to resume, fetch the project's ICPs count.
- If ICPs exist AND the resumed session's stored messages do not include the diff-mode intro (detect by checking for the phrase "variation" or by a new `session.metadata.mode === 'diff'` flag), do **not** silently resume. Instead:
  - Show an inline banner at the top of the chat: *"You have N saved ICPs. Start a fresh diff-mode conversation, or continue this draft?"* with two buttons: **Start fresh** (calls existing `restartWizard`) and **Continue draft** (keeps current behaviour).
- If no ICPs exist, keep today's silent resume behaviour.
- On successful `saveICP`, also cancel any *other* `in_progress` ICP sessions for the project so the next visit starts clean:
  ```ts
  await supabase.from('wizard_sessions')
    .update({ status: 'cancelled' })
    .eq('project_id', currentProject.id)
    .eq('session_type', 'icp')
    .eq('status', 'in_progress');
  ```
  (run before/after marking current session complete).

### 2. `supabase/functions/icp-wizard/index.ts` — tag diff sessions

- When creating a new session, persist `metadata: { mode: hasPriorIcps ? 'diff' : 'first' }` on `wizard_sessions` (or store inside `draft_output._meta` if no metadata column — check schema; `wizard_sessions` currently has no metadata column, so use `draft_output._meta.mode`).
- Return `mode` in the response so the client can render the diff-mode chips even after page reload of a resumed session.
- When resuming (message present + session_id), if `hasPriorIcps` and the session's mode is `first`, append a one-time system nudge to the assistant context: *"The project now has additional ICPs; treat this as diff mode from here on."* — server-side prompt already handles this via `<existing_icps>`, so this is mostly cosmetic; the real fix is client-side.

### 3. Persist suggested replies across turns

- `suggested_replies` is currently only surfaced on the very first turn. Store the diff-mode chips in component state keyed off `existing_icp_count` and re-show them whenever the user hasn't yet answered "variation vs different segment". This means users who reload mid-conversation still get the chips.

## Out of scope

- No schema changes required (use `draft_output._meta` for mode flag).
- No changes to the persona wizard (already works the same way and can adopt this pattern later if needed).

## Files touched

- `src/pages/ICPWizard.tsx`
- `supabase/functions/icp-wizard/index.ts`
