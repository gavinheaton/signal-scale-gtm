## Goal
Let users **move** a persona to a different ICP, or **duplicate** it into another ICP (so the same buying role can be reused across segments without rebuilding from scratch).

## Why it makes sense
Personas today are hard-bound to a single `icp_id`. In reality, the same role (e.g. "Head of Marketing") often shows up across multiple ICP segments with mostly overlapping goals/pains and only small deltas. Rebuilding via the wizard each time is wasteful.

## UX

**Entry points** — from both places a persona is actioned today:
1. `PersonaDetailModal` footer: add **Move to ICP…** and **Duplicate to ICP…** buttons next to Edit/Delete.
2. `ICPPersonas.tsx` persona card: add a small overflow menu (`⋯`) with the same two actions (so users don't have to open the modal).

**Dialog** (single shared component `MovePersonaDialog.tsx`):
- Title switches between "Move persona" / "Duplicate persona".
- Shows current ICP as read-only chip.
- Target ICP dropdown listing all other ICPs in the project (name + matrix category badge). Current ICP disabled.
- For duplicate: optional "New persona name" input, pre-filled as `"{original name} ({target ICP name})"`.
- Confirm button, loading state, toast on success, refresh gallery.

## Behaviour

**Move**
- Update the persona row: `icp_id = <target>`. Nothing else changes. `is_current` stays true.

**Duplicate**
- Insert a new `personas` row copying every field from the source (persona_name, role_in_buying, goals, pain_points, channel_preferences, how_we_help, organisational_context, buying_behaviour, ai_readiness_score), overriding `icp_id` to the target, `persona_name` to the user-supplied name, `is_current = true`, new `id`. Do NOT copy `wizard_session_id` or any Notion linkage fields.

Both actions are pure data ops — no edge function needed, done client-side via the Supabase client under existing RLS (persona rows are already writable by org members).

## Guardrails
- Disable both actions when the project has only one ICP (nowhere to move/duplicate to) — show a tooltip explaining why.
- Prevent choosing the same ICP as source.
- Wrap in try/catch with toast errors.

## Files touched
- **New:** `src/components/MovePersonaDialog.tsx` — shared move/duplicate dialog.
- **Edit:** `src/components/PersonaDetailModal.tsx` — add Move/Duplicate buttons + wire dialog.
- **Edit:** `src/pages/ICPPersonas.tsx` — add overflow menu on persona cards + wire dialog; refresh `personas` state after success.

## Out of scope
- Bulk move/duplicate across many personas at once.
- Sunburst re-layout animation (it will just re-render from updated data).
- Editing the duplicated persona inline in the dialog (user can open it after and edit if needed).
