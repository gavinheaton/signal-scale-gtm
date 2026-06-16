## Goal
After "Start Over", the user should land back on the same starting screen as a brand-new project — with both options available: **Upload Existing Document** and **Start Brand Voice Wizard**.

## Problem
Currently "Start Over" only cancels the in-progress wizard session and navigates to `/project/brand-voice`. That page reads the `brand_voices` row for the project; if a row exists (which it always does, since the wizard inserts one immediately on first turn), the page renders the saved/in-progress brand voice card with **View / Export / Continue** buttons instead of the empty-state card that offers upload + wizard.

So after Start Over, the user sees either a stale "complete" view or a "Continue" button — never the upload option.

## Fix

### 1. `src/pages/BrandVoiceWizard.tsx` — extend `startOver`
In addition to cancelling the in-progress wizard session, also clear the associated draft data so the BrandVoice landing page shows the empty state:

- Cancel in-progress `wizard_sessions` rows for this project + `session_type = 'brand_voice'` (already done).
- Delete the `brand_voices` row(s) for this project. This is the cleanest reset and matches "the brand changes or needs to be reworked" intent. A deleted row removes ProPresence-sync timestamps too, so the next completion re-syncs cleanly.
- Reset local React state (already done).
- Navigate to `/project/brand-voice` (already done) — the empty-state card will now render with both **Start Brand Voice Wizard** and **Upload Existing Document** buttons.

### 2. Update the confirm-dialog copy
Current copy says "Your saved brand voice record stays in place until you complete and save a new one." That's no longer true. Replace with something like:

> "This will permanently delete the current brand voice and wizard conversation for this project so you can rebuild from scratch (e.g. after a rebrand). You'll be returned to the start screen where you can upload a new tone-of-voice document or run the wizard again."

### 3. No schema changes
- `wizard_session_status = 'cancelled'` is already in place from the last migration.
- `brand_voices` already has a delete RLS policy scoped via `user_has_org_access`, so a client-side delete works for any org member who can access the project.

## Out of scope
- No changes to `BrandVoice.tsx` upload flow — it already supports both paths.
- No changes to the edge function — it already creates a fresh session on first invocation when none is `in_progress`.
- No change to the ProPresence sync behaviour beyond the implicit "fresh row will sync again on next completion".

## Acceptance
1. From the wizard, click **Start Over → Yes, start over**.
2. App navigates to `/project/brand-voice` and shows the **empty-state card** with both **Start Brand Voice Wizard** and **Upload Existing Document** buttons.
3. Clicking **Upload Existing Document** uploads the file and starts a fresh wizard session that analyses the new doc end-to-end (Pass 1 extraction + Pass 2 gap report).
4. Clicking **Start Brand Voice Wizard** starts a fresh conversational session from the intro message.
