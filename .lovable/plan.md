

# Fix Empty Persona Modal Sections

## Problem
Persona sections show "Not captured yet" even though the information was discussed in the wizard chat. Two causes:

1. **Personas created before the migration** — `organisational_context` and `buying_behaviour` columns didn't exist, so those fields are `{}` in the database even though the AI captured them in the wizard session's `draft_output`.
2. **Draft mapping gaps** — The AI may structure data under slightly different keys in the draft JSON than what the save logic expects. For example, the AI prompt asks for `preferred_evidence` as a separate key, but the save logic nests it inside `channel_preferences`.

## Solution

### 1. Backfill existing personas from wizard session drafts
Create a one-time backfill that checks `wizard_sessions` with `session_type = 'persona'` and `status = 'complete'`, extracts `organisational_context` and `buying_behaviour` from `draft_output`, and updates the corresponding persona records.

- Run as a script via the Supabase SQL editor or as a migration
- Match sessions to personas by `project_id` + `draft_output->>'persona_name'`

### 2. Improve the save logic in `PersonaWizard.tsx`
The current save maps draft fields directly but some AI draft structures nest data differently. Add defensive extraction:

- If `draft.organisational_context` is empty but exists under a different key in the draft, extract it
- Same for `buying_behaviour` and `preferred_evidence`
- Log the full draft to console before save (dev aid) so mismatches are visible

### 3. Add a "Refresh from Session" action to the modal
When a persona's sections are mostly empty but a completed wizard session exists for it, show a subtle "Data available — refresh from wizard session" button that pulls the draft and re-saves.

## Changes

### File: `src/pages/PersonaWizard.tsx`
- Improve `savePersona` to be more defensive about extracting nested/variant draft keys
- Flatten any nested objects the AI might produce (e.g. `goals.personal_goals` + `goals.organisational_goals` should stay as-is, but a bare string should be wrapped)

### File: `src/components/PersonaDetailModal.tsx`  
- Add a "Refresh from wizard data" button that appears when sections are empty
- On click, query `wizard_sessions` for the matching session, extract draft fields, update the persona record, and refresh the modal

### File: Migration (SQL)
- Backfill `organisational_context` and `buying_behaviour` on existing personas from their wizard session `draft_output` where those fields are currently `{}`

## Files
- **Modify**: `src/pages/PersonaWizard.tsx` — defensive draft extraction in save logic
- **Modify**: `src/components/PersonaDetailModal.tsx` — add refresh-from-session capability
- **Create**: Migration to backfill existing personas from wizard session drafts

