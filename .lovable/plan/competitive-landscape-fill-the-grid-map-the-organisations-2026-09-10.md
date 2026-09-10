# Competitive Landscape: fill the grid, map the organisations

## What's wrong today

- The comparison grid for ERI has 15 dimensions but **zero filled cells** — every claim and rating is blank, even though the research already stored positioning, claims, proof points, strengths, weaknesses and segments for 15 confirmed organisations.
- Because the grid is empty, the whitespace picture has nothing to plot: every dot sits at zero, and it shows *dimensions* (features) rather than the organisations you want to see.

## What we'll build

### 1. Auto-map the grid from the research

A new "Map from research" button on the Comparison Grid. It reads each confirmed organisation's stored research plus the project context and fills, for every organisation and every dimension:

- a short claim in the organisation's own language (or "no evidence" left blank if the research doesn't support one),
- a strong / parity / weak rating,
- the "Us" column from the project's own value proposition and proof points.

Rules: only stored research is used, never outside knowledge. Cells you have already typed are kept unless you tick "overwrite". Runs in the background with progress, saving as it goes, so a slow pass never loses work.

### 2. Whitespace becomes an organisation map

Replace the feature scatter with a positioning map where **each dot is an organisation** (plus a highlighted dot for you):

- Two dropdowns pick which dimensions form the horizontal and vertical axes; they default to the two dimensions rated most important.
- Dot position = that organisation's rating on each axis (strong / parity / weak, with slight spread so overlapping names stay readable).
- Dot colour = archetype (capital coalitions, engineering and systems, applied research, place alliances, other); dot size = how many credible claims they hold overall.
- Names are labelled on the dots; hovering shows their claims on both axes.
- Empty regions are shaded and labelled as open ground, so the gap between clusters is visible.
- Beneath the map, a short "who owns what" strip lists, per dimension, which organisations are strong and which dimensions nobody owns.
- The existing whitespace cards stay below, and clicking a dot filters the cards to that organisation.

The board-pack export gets the same organisation map instead of the feature scatter.

## Technical notes

- New `mode: "map_grid"` in `supabase/functions/competitor-whitespace/index.ts` (or a sibling `competitor-map-grid` function) that batches competitors ~4 at a time through `aiJson`, upserting `competitor_scores` rows per batch; reuses `loadProjectContext`. Existing non-empty cells are skipped unless `overwrite` is set.
- `ComparisonGrid.tsx`: add the button, invoke the function, poll/refresh scores as batches land.
- Rewrite `WhitespaceChart.tsx` to build competitor-centric points (`x`/`y` from ratings on the two selected dimensions, jitter for ties, colour by archetype, `z` from claim count) and expose axis selection; keep a `print` variant with static labels.
- `WhitespacePanel.tsx`: axis pickers, ownership strip, dot-click filtering of whitespace cards.
- `CanvasPrint.tsx`: swap in the new chart with fixed default axes.
- No schema changes needed.
