## Make problem statements editable on /project/value-prop

Currently in the "Problems worth solving" section, each problem's text is rendered as static `<p>`. Users can toggle the 4 criteria and delete, but cannot edit the wording of the problem itself.

### Changes (single file: `src/pages/ValueProp.tsx`)

1. **Inline edit UI for each problem row**
   - Replace the static `<p>{p.problem}</p>` with a click-to-edit pattern:
     - Default: text display with a small pencil (Edit) icon button beside it.
     - Editing state: `Textarea` (auto-sized, 2 rows) prefilled with current text, plus Save and Cancel buttons.
   - Track editing state locally: `const [editingId, setEditingId] = useState<string | null>(null)` and `const [editingText, setEditingText] = useState('')`.

2. **Save handler**
   - `updateProblemText(id, text)`:
     - Trim, guard against empty.
     - `supabase.from('value_prop_problems').update({ problem: text }).eq('id', id)`.
     - On success: update local `problems` state, clear editing state, toast success.
     - On error: toast error, keep editing state open.

3. **Manual add UX improvement (small)**
   - Keep existing `addManualProblem` (uses `prompt()`), but after creation, drop straight into edit mode for the new row so users can refine without a second click. Optional — include only if it doesn't complicate the diff.

### Out of scope
- No schema changes (the `problem` column already exists and is writable via existing RLS).
- No edge function changes.
- No changes to AI-brainstormed insertion flow beyond making resulting rows editable (which they will be automatically).
