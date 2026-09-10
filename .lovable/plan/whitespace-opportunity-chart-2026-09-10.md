# Whitespace opportunity chart

Add a visual map of competitive whitespace at the top of the Whitespace tab, and include it in the board pack.

## The chart

A two-axis plot, one dot per comparison dimension:

- Horizontal: how crowded the dimension is — how many confirmed competitors are rated strong on it.
- Vertical: how much it matters to buyers (importance, 1–5).
- Dot size: how many competitors have any claim on the dimension.
- Dot colour: whether we are strong, at parity, weak or unrated on that dimension.

Four labelled zones:

```text
matters a lot |  OPEN GROUND        |  HARD FIGHT
              |  (nobody owns it)   |  (everyone strong)
              |---------------------|-------------------
matters less  |  LOW STAKES         |  CROWDED NOISE
              |  empty              |  everyone claims it
                 few strong             many strong
```

Hovering a dot names the dimension, who is strong, and our own rating. Clicking a dot scrolls to any whitespace cards that reference that dimension.

Below the chart, the existing whitespace cards stay as they are.

## Importance

Dimensions need an importance value. Each dimension gets an editable 1–5 importance, shown as a small control in the comparison grid row header and adjustable inline. When the AI proposes dimensions it also proposes an importance, so charts are useful without manual entry. Existing dimensions default to 3 until changed.

## Board pack

The competitive section of the board pack gains the same chart above the comparison grid, drawn print-safe (no hover, plain labels), plus a one-line reading key.

## Technical notes

- Migration: add `importance smallint not null default 3` to `public.competitor_dimensions` (grants and RLS unchanged; column added to an existing table).
- `competitor-whitespace` dimensions mode: prompt returns `importance` per dimension and stores it.
- New `src/components/competitors/WhitespaceChart.tsx` — Recharts `ScatterChart` with `ReferenceLine` quadrant dividers and custom tooltip; derives crowding and our rating from `competitor_scores` for confirmed competitors only.
- `WhitespacePanel.tsx` loads competitors, dimensions and scores alongside whitespace items and renders the chart above the card list.
- `ComparisonGrid.tsx` adds the inline importance control on each dimension row.
- `CanvasPrint.tsx` renders the same chart component in a static/print variant before the grid.
- `src/types/competitors.ts`: add `importance` to `CompetitorDimension`.
