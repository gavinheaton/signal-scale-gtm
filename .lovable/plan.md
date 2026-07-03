
# Board-pack PDF + completion tracking

Two related pieces that were proposed earlier but not built yet. The recent work only added multi-select AI suggestions inside a canvas box — no PDF export, no completion state.

## 1. Client-side "board pack" PDF (multipack)

One button that renders a single multi-page PDF covering all three canvas variants (Disruptors, Shared Value, Business Model) for the current project, plus the narrative and critique.

Approach: **client-side print-to-PDF** using `window.print()` with a dedicated print stylesheet — zero infra, no edge function, no new dependencies.

- New route `/project/canvas/print` (or a `?print=1` mode on `Canvas.tsx`) that renders:
  - Cover page: project name, date, validation-coverage summary.
  - One page per canvas variant, laid out as a printable grid (loads entries for each of the three variants, not just the currently-selected one).
  - Narrative section (rendered markdown), if present.
  - Critique section (summary + weak boxes + gaps + alignment issues), if present.
- Global `@media print` rules in `src/index.css`: hide app chrome (sidebar, header, tab bar, action buttons), force `A4 landscape` for canvas pages / `A4 portrait` for narrative, `page-break-after: always` between sections, remove hover/interactive affordances.
- "Export board pack" button in the Canvas header opens the print view in a new tab and calls `window.print()` on load. User picks "Save as PDF" from the browser dialog.

Non-goals: no server-side PDF (Puppeteer/Playwright), no per-box export, no branded PDF template beyond print CSS. Can upgrade later if needed.

## 2. Completion tracking

Let the user mark each canvas variant, its critique, and its narrative as "complete" so the board pack (and the canvas page itself) shows what's signed off.

**Data:** add a `completion` jsonb column on the existing `canvases` table:

```json
{ "canvas": false, "critique": false, "narrative": false }
```

Defaults to all false. No new table needed — completion is per-canvas (which is already per project + variant).

**UI on `Canvas.tsx`:**
- Small checkbox next to each variant tab label ("Disruptors ✓"). Toggling it flips `completion.canvas` for that variant's canvas row.
- Checkbox on the **Critique** button (or inside the critique sheet header) → `completion.critique`.
- Checkbox on the **Generate narrative / View narrative** button (or in the narrative sheet header) → `completion.narrative`.
- Auto-uncheck `critique` / `narrative` when the user regenerates them (they need re-review).
- Auto-uncheck `canvas` when any entry in that variant changes (add / edit / delete / status change / AI-added).

**In the board pack PDF:** each section header shows a ✓ Complete or ⋯ In progress chip based on `completion`.

## Files touched

- `supabase/functions` — none.
- **Migration:** add `completion jsonb not null default '{"canvas":false,"critique":false,"narrative":false}'::jsonb` to `public.canvases`.
- `src/components/canvas/types.ts` — extend `Canvas` interface with `completion`.
- `src/pages/Canvas.tsx` — completion checkboxes in header, auto-uncheck on regenerate, "Export board pack" button, invalidate `completion.canvas` on entry changes.
- `src/components/canvas/CanvasBox.tsx` — call an `onEntriesChanged` prop after add/edit/delete so the page can flip `completion.canvas` to false.
- `src/pages/CanvasPrint.tsx` (new) — print-optimised render of all three variants + narrative + critique + completion chips.
- `src/App.tsx` — register `/project/canvas/print` route (outside `AppLayout` so no sidebar).
- `src/index.css` — `@media print` rules.

## Open question

Should "canvas complete" auto-uncheck on **every** entry change (safest, but noisy for small edits), or only when entries are added/deleted (edits don't invalidate sign-off)? Default in the plan is auto-uncheck on all changes; happy to switch to add/delete-only.
