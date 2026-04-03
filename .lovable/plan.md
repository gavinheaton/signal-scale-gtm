

# Edit & Delete Personas via AI-Guided Conversation

## What it does
Adds edit and delete actions to each persona card on the ICP & Personas page. Both actions route through the Persona Wizard so the AI can understand context before making changes:

- **Edit**: Opens the Persona Wizard pre-loaded with the existing persona data. The AI reads the current persona, asks why the user wants to change it, then guides the update conversationally.
- **Delete**: Opens a confirmation dialog. On confirm, the AI isn't needed — the persona is soft-deleted (set `is_current = false`) or hard-deleted.

## Changes

### 1. Modify `src/pages/ICPPersonas.tsx`
- Add Edit (pencil) and Delete (trash) icon buttons to each persona card header
- Edit button navigates to `/project/persona-wizard?icp_id={icp_id}&edit_persona_id={persona_id}`
- Delete button opens a confirmation dialog; on confirm, updates `is_current = false` on the persona record and removes it from local state
- Import `Dialog` components and `Pencil`, `Trash2` icons

### 2. Modify `src/pages/PersonaWizard.tsx`
- Read `edit_persona_id` from search params
- When present, fetch the full persona record from Supabase on init
- Skip resuming existing wizard sessions when in edit mode
- Pass `edit_persona_id` and the persona's existing data to the edge function
- On save: `UPDATE` the existing persona row instead of `INSERT`ing a new one

### 3. Modify `supabase/functions/persona-wizard/index.ts`
- Accept optional `edit_persona_id` in the request body
- When present, fetch the full persona record and inject its data into the system prompt as `EXISTING PERSONA DATA` context
- Prepend to the ICP context so the AI sees what's already been captured
- Use a different synthetic init prompt: "The user wants to edit the persona '[name]'. Review the existing data, then ask what they'd like to change and why."
- On the frontend save step, the wizard will update rather than insert — no edge function change needed for that

## Technical details

**Delete flow**: Uses `supabase.from('personas').update({ is_current: false }).eq('id', id)` — a soft delete that preserves history. The existing query already filters by `is_current: true` implicitly (or we add that filter).

**Edit flow init prompt**: The AI sees the full persona JSON in system context plus a synthetic message like: "I want to edit the persona 'The Visionary CTO'. Show me what's currently captured and ask what I'd like to change." This ensures the AI reads the data first, then asks diagnostic questions before modifying anything.

**Save logic branch**: In `PersonaWizard.tsx`, if `edit_persona_id` is set, `savePersona` calls `.update()` instead of `.insert()`.

## Files
- **Modify**: `src/pages/ICPPersonas.tsx` — add edit/delete buttons + delete confirmation dialog
- **Modify**: `src/pages/PersonaWizard.tsx` — handle edit mode (load persona, update on save)
- **Modify**: `supabase/functions/persona-wizard/index.ts` — accept edit context, inject persona data into prompt

