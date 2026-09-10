# One market-position map for the Whitespace tab

Replace the "pick two dimensions" picture with a single, overall market-position quadrant — Magic Quadrant style — read through your personas. The detailed dimension map stays, tucked behind a toggle.

## The map

One dot per organisation, plus you. Two overall axes, each scored 0–100:

- Across: **Sector leadership** — presence, credibility and reach with the buyers in your personas.
- Up: **Differentiation** — how distinct their position is from everyone else in the field.

```text
   high differentiation |  VISIONARIES        |  LEADERS
                        |  distinct, smaller   |  distinct and dominant
                        |----------------------|------------------------
   low differentiation  |  NICHE PLAYERS       |  CHALLENGERS
                        |  narrow, quiet        |  big but interchangeable
                           low leadership          high leadership
```

- Dot colour by group (archetype); your own dot outlined and labelled.
- Hovering a dot shows the organisation, both scores, the one-line reason, and the comparison rows the reason draws on.
- Clicking a dot still highlights the related gap cards below.

## Persona lens

A selector above the map: **All personas** (default, blended) or a single persona. Choosing a persona re-reads the assessment for that persona's priorities, so you can see how your position shifts for, say, a council planner versus an investment lead.

## How positions are decided

An "Assess market position" button runs one AI pass per lens. It reads the stored research on every confirmed organisation, your comparison grid, your value proposition and the selected personas, then gives each organisation a leadership score, a differentiation score, a short reason, and names the grid rows behind that reason. Results are saved, so the map loads instantly afterwards and can be re-run when the research changes. Manual nudging of a score is possible inline on the dot's tooltip panel.

## Detail view

Below the quadrant, a "Show dimension detail" link reveals the existing two-dimension organisation map and the "who owns what" list, unchanged.

## Board pack

The board pack shows the quadrant (all-personas lens) in place of the two-dimension map, print-safe, with a one-line reading key. The dimension map moves to the following page.

## Technical notes

- Migration: `public.competitor_market_positions` — `id`, `project_id`, `competitor_id uuid null` (null = us), `persona_id uuid null` (null = all personas), `leadership smallint`, `differentiation smallint`, `rationale text`, `cited_dimension_ids uuid[]`, timestamps; unique on `(project_id, competitor_id, persona_id)`. GRANTs for `authenticated` + `service_role`, RLS enabled with the standard project/org-membership policy, plus the `discovery_set_updated_at` trigger.
- `supabase/functions/competitor-whitespace/index.ts`: new `market_position` mode. Loads confirmed competitors, dimensions, scores, project context and personas; batches organisations through `aiJson` with a strict schema (`{ name, leadership, differentiation, rationale, cited_dimensions[] }`); validates names/dimension labels and clamps scores to 0–100; upserts rows for the chosen `persona_id`; runs as a background `competitor_runs` job (202 + `EdgeRuntime.waitUntil`) with incremental `saved_count`, matching the existing `map_grid` pattern.
- New `src/components/competitors/MarketPositionChart.tsx` — Recharts `ScatterChart`, 0–100 axes, `ReferenceLine` at 50/50, four quadrant labels via `ReferenceArea`/labels, archetype colours, outlined "Us" dot, tooltip with reason and cited rows, `print` variant.
- `src/components/competitors/WhitespacePanel.tsx`: loads `competitor_market_positions` and personas, adds the persona selector, the assess button with polling, renders the new chart, and collapses the existing `WhitespaceChart` plus "who owns what" behind a toggle.
- `src/pages/CanvasPrint.tsx`: render `MarketPositionChart` (print, all-personas) before the existing `WhitespaceChart`.
- `src/types/competitors.ts`: add `MarketPosition` interface and quadrant label constants.
