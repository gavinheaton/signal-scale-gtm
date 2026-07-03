# Fix critique freshness · proper edit UX · bulk-add AI suggestions

## 1. Critique includes recent edits

**Root cause:** two racing issues in `CanvasBox`:
- Inline `contentEditable` only saves on blur, so if the user clicks **Critique** immediately after typing, the edit fires after the critique request has already sent stale content.
- Adding an AI suggestion or editing a box doesn't update `canvases.updated_at`, so the critique fn has no signal for freshness (minor — mostly about the race).

**Fix:**
- Replace `contentEditable` with an explicit edit mode (pencil icon → `<Textarea>` + Save/Cancel — same pattern as `Add`). This eliminates the blur race and gives users clear affordance (also covers request #2).
- In `Canvas.tsx`, before calling `runCritique` / `runNarrative`, `document.activeElement?.blur()` and `await` a `load()` so the entries state is guaranteed fresh.
- On the server side (`canvas-critique`), select `content, status, source, updated_at` and pass `updated_at` into the prompt so the model can reason about "recent" changes. Also add `AI-suggested and auto-imported entries should be treated as first-class content for critique` to the system prompt.

## 2. Proper manual editing per entry

New per-entry UI in `CanvasBox`:
- Hover reveals **pencil** (edit) and **trash** icons.
- Click pencil → the entry text swaps to a `<Textarea>` with **Save / Cancel** buttons underneath.
- Save calls the existing `updateContent` (writes `content` + `updated_at = now()` client-side) and reloads.
- Clicking the status pip still cycles assumption → hypothesis → validated (unchanged).
- Drops the buggy `contentEditable` element.

## 3. Bulk-add AI suggestions

Currently the AI returns 3 suggestions and the user clicks ✓ on each one individually.

**Fix in `canvas-suggest` (server):** accept an optional `count` in the request body (default 5, max 8) and adjust the prompt accordingly.

**Fix in `CanvasBox` (client):**
- Show suggestions with individual **✓** buttons **and** an **Add all** button at the top of the suggestion list.
- Add a small **⟳ More** button next to Add all to fetch another batch (appends, doesn't replace).
- After adding, remove that suggestion from the list; **Add all** inserts all remaining as a single `.insert([...])` call for one round-trip.
- Bump the default `Sparkles` button to fetch 5 suggestions instead of 3.

## Files touched

- `src/components/canvas/CanvasBox.tsx` — new edit mode, bulk-add / add-all / more buttons.
- `src/pages/Canvas.tsx` — blur + await load before critique/narrative.
- `supabase/functions/canvas-suggest/index.ts` — support `count`, larger default.
- `supabase/functions/canvas-critique/index.ts` — include `updated_at` + tweak system prompt.

## Non-goals

- No schema changes — `updated_at` already exists on `canvas_entries` via the discovery trigger.
- Board-pack PDF and completion checkboxes stay parked (previously proposed) — this ships in a later turn.
