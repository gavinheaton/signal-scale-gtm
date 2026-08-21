# Save AI variations per value prop

## The problem

On /project/value-prop, the Refine tab's "3 variations" button holds the AI results in memory only. Nothing writes them to the database, so pressing Save (which only updates the value proposition record's own fields) never persists them, and switching value props or reloading the page discards them. Since each value prop in "Your Value Props" already carries its own persona, the variations simply need to be stored against the value prop that generated them.

## Fixes

1. **New store for variations.** A `value_prop_variations` table holding the label, angle and statement, linked to its value prop (and carrying that value prop's icp/persona for reference).

2. **Save immediately on generate.** As soon as the AI returns variations they are written to the database. If the write fails, the error is shown and the generated text stays on screen so nothing is lost.

3. **Variations load with the value prop.** Selecting a value prop loads its saved variations, so each persona's set is visible when you come back to it. New generations append to the list rather than replacing it, with a timestamp per variation.

4. **Manage saved variations.** Each variation row keeps "Use this" (copies into the final statement), plus editable text and a delete action. The one applied to the statement is flagged as selected so it's obvious which was chosen.

5. **Guard the generate action.** The button is disabled until the value prop is saved and has a statement or fields to work from, and the generated set is tagged with the persona name at generation time.

## Technical detail

- Migration: `value_prop_variations` (id, project_id, value_prop_id fk cascade, icp_id, persona_id, label, angle, statement, is_selected bool, created_at, updated_at) with GRANTs for `authenticated` + `service_role`, RLS enabled, and the project-scoped policy pattern used by `value_prop_problems`.
- `src/pages/ValueProp.tsx`: replace local-only `variations` state with rows loaded from the new table in the existing `selectedId` effect; `suggestVariations` inserts returned rows (mapping label/angle/statement plus the selected value prop's icp_id/persona_id) and sets state from the inserted rows; add update/delete handlers; "Use this" sets `statement` locally and marks that row `is_selected` (clearing the flag on siblings for the same value prop).
- No change to `supabase/functions/value-prop-assist/index.ts` — the `variations` action already returns the needed shape.
