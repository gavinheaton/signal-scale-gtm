# Multi-select AI suggestions

Right now each AI suggestion in a canvas box has a single ✓ (add one) button, plus **Add all** / **More** at the top. There's no way to cherry-pick, say, 3 of 5.

## Change

In `src/components/canvas/CanvasBox.tsx`:

- Track a `selected: Set<number>` of suggestion indices in local state.
- Render a small **Checkbox** (shadcn `@/components/ui/checkbox`) next to each suggestion, replacing/augmenting the current row layout. Keep the individual ✓ quick-add button for one-click adds.
- Header row above suggestions gains an **Add selected (n)** button, disabled when `n === 0`. Clicking it:
  - Calls `addManyAiEntries(selected suggestions)` (existing helper — single insert round-trip).
  - Removes those items from the `suggestions` list and clears the selection.
- Keep **Add all** and **More** buttons unchanged.
- Clear selection whenever a new batch is fetched (`suggest(false)`) or "Add all" fires.
- Optional nicety: a tiny **Select all / Clear** toggle on the header row for quick bulk selection before hitting "Add selected".

## Files touched

- `src/components/canvas/CanvasBox.tsx` — only file. No schema, no edge function, no other UI changes.

## Non-goals

- No changes to how suggestions are generated or to the count returned by `canvas-suggest`.
- Doesn't touch critique/narrative flows or the pending board-pack PDF / completion-tracking work.
