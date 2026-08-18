# Stop wizard drafts from being lost

## What actually happened

The ERI ICP was never lost from the database — it was hidden. The wizard's backend marks a session as **complete** the moment the AI decides the ICP is finished, before anyone presses Save. Confirmed in the data: the ERI session was flagged complete at 02:59 with a full draft, while no ICP record existed.

When you returned to the wizard, it only looks for sessions marked **in progress**, found none, and started a brand new blank conversation. The finished draft was still sitting in the database, invisible from the app.

The same "complete before save" pattern exists in the Persona, Campaign and Brand Voice wizards, so the same silent loss can happen there.

## Fixes

1. **A session is only "complete" once the record is saved.** The AI finishing the draft no longer changes session status — it stays in progress until the ICP/persona/campaign/brand voice row is actually written. Apply to all four wizards.

2. **Resume finished drafts.** The wizard's resume lookup picks up the latest unsaved session regardless of the AI's completion flag, so reopening the wizard restores the finished draft with its Save button ready instead of starting over.

3. **Unsaved drafts panel.** On ICP & Personas (and the equivalent Campaigns / Brand Voice pages), show a small "Unsaved draft" card when a wizard session exists with content but no saved record. Two actions: Resume, or Discard. This makes any future orphaned draft visible and recoverable without database access.

4. **Local safety copy.** The wizard keeps a copy of the current draft in browser storage keyed by session, restored if a page refresh or crash happens before the server round-trip lands.

5. **Save failure is loud and non-destructive.** If the save insert fails, the draft, the session and the chat stay exactly as they were and the error explains it wasn't saved — no status change, no navigation away.

## Technical detail

- `supabase/functions/{icp,persona,campaign,brand-voice}-wizard/index.ts`: drop `status: isComplete ? 'complete' : 'in_progress'` from the session update; always keep `in_progress`. Brand Voice keeps writing its own `brand_voices.status` as it does today — only the wizard session status changes.
- Session status becomes `complete` only in the client save handlers (`ICPWizard.saveICP` and equivalents) after a successful insert, which they already do.
- Resume queries change from `.eq('status','in_progress')` to `.in('status',['in_progress'])` plus removal of the assumption that a complete-flagged draft is saved; existing stale/diff-mode logic is untouched.
- New shared component for the unsaved-draft card, querying `wizard_sessions` filtered by project and type where `status = 'in_progress'` and `draft_output` has more than `_meta`.
- Browser storage key: `wizard-draft:<session_id>`, cleared on successful save or discard.
- No schema changes needed.
