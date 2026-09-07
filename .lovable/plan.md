# Keep AI-generated canvas content from disappearing

## What's happening

On the canvas, the sparkle (AI) button generates suggestions for a box, but those suggestions only live in the browser until you tick them and press "Add selected" or "Add all". Nothing about them is stored, so a refresh — or navigating away and back — wipes them.

Confirmed from the data: the ERI canvas has 13 saved entries (last one 26 August) and no stored AI suggestions anywhere, because there is nowhere to store them.

The Critique and Narrative buttons do save their results, so this is specific to the per-box suggestions.

## The fix

1. Store generated suggestions as soon as the AI returns them, against the canvas and the box they belong to, with a state of pending, accepted, or dismissed.
2. When a box loads, show any pending suggestions again — so a refresh brings back exactly what you were looking at.
3. Accepting a suggestion (single, selected, or all) turns it into a real canvas entry as it does today and marks the suggestion accepted so it stops reappearing.
4. Add a small "Dismiss" control so unwanted suggestions can be cleared rather than lingering forever; "More" keeps appending to the stored list.
5. Show a quiet error message if a save fails, instead of failing silently.

## Also worth fixing at the same time

The three tabs (Disruptors, Shared Value, Business Model) all share one canvas record and one pool of entries, and the page always reopens on Disruptors. So work done on the Business Model or Shared Value tab looks lost even though it is stored — I can see Business Model and Shared Value entries mixed into the ERI and Mainstay canvases. I'd keep each tab's entries separate and reopen on the tab you last used. Say the word if you want this included; otherwise I'll do item 1-5 only.

## Technical notes

- New table `public.canvas_suggestions`: `id`, `canvas_id` (FK to `canvases`), `box text`, `content text`, `status` (`pending`/`accepted`/`dismissed`, default `pending`), `created_at`, `updated_at`, with GRANTs to `authenticated`/`service_role`, RLS enabled, and the same org-membership-via-canvas policy pattern used by `canvas_entries`.
- `src/components/canvas/CanvasBox.tsx`: after `canvas-suggest` returns, insert rows into `canvas_suggestions` and drive the suggestion list from the DB rather than local state only; load pending rows on mount; on accept, insert into `canvas_entries` and set the suggestion to `accepted`; dismiss sets `dismissed`. Surface insert errors via toast.
- Optional variant fix: filter entries by the active variant's box keys (or add `variant` to `canvas_entries`, backfilled from the box key) and persist the last-viewed tab on the `canvases` row; `src/pages/CanvasPrint.tsx` already expects per-variant bundles.
