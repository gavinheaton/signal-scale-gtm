# Bring the competitive landscape into the ecosystem map

Confirmed competitors already appear on the map as dots linked to your project, but only with their name, website and rival type. Everything you have built since — archetypes, partners found on your own site, the comparison grid, the market position map and the whitespace gaps — is not there yet. This brings it in.

## What changes on the map

**Competitors carry their archetype.** Each competitor dot is labelled by archetype (scale and capital coalitions, engineering and systems, applied research, place alliances, other) and grouped so like sits with like instead of scattered.

**Partners are shown as partners, not rivals.** Organisations discovered from links on your own website are drawn as partner dots joined to your project with a "partners with" line, rather than a "competes with" line.

**Market position comes across.** Where an organisation has been placed on the market-position map, its dot carries its sector-leadership and differentiation scores, and the strongest names are drawn nearer the centre of the map so leaders read as closer.

**Comparison grid standing comes across.** Each competitor dot lists the dimensions it is rated strong on, and a "competes with" line is drawn to a segment only when the research actually supports it.

**Whitespace gaps become nodes.** Each whitespace item ("nobody owns this", "everyone says this", "your angle") becomes a small theme-style node on the outer ring, joined to the dimensions and the organisations it references, so open ground is visible on the map itself.

**Node detail panel.** Clicking a competitor or partner shows its archetype, positioning, market-position scores with the one-line reasoning, dimensions it is strong on, and any whitespace it touches.

## Also fixed while here

The sync reads a project field that does not exist (`website_url` instead of `website`), so the project's own record fails to load and the centre node falls back to a generic label with no website. That is corrected.

## Sync feedback

The "Sync from data" toast gains partner and whitespace counts alongside the existing segment, company, competitor, role, people, theme and insight counts.

## Technical notes

- `supabase/functions/ecosystem-sync/index.ts`
  - Fix the `projects` select to `id, name, website`.
  - Widen the competitor select to `archetype, source, claims, strengths, weaknesses, pricing_signals`; also load `competitor_dimensions`, `competitor_scores`, `competitor_market_positions` (persona_id is null — the blended assessment) and `competitive_whitespace`.
  - Split competitors by `source`: `own_site` rows become `kind: "partner"` nodes with a `partners_with` edge; the rest stay `kind: "competitor"` with `competes_with`.
  - Ring placement: derive ring from the market-position leadership score when present (high leadership → ring 2, mid → 3, otherwise current ring 2 default), and cluster by `archetype` so archetype groups sit together.
  - Node `meta` gains `archetype`, `leadership`, `differentiation`, `position_rationale`, `strong_dimensions` (dimension labels where the row's rating is `strong`).
  - Segment edges: keep the existing token match but also add a `serves` edge when a `competitor_scores` claim mentions the segment name.
  - New whitespace nodes: `kind: "theme"`, `ref_table: "competitive_whitespace"`, outer ring, `meta.whitespace_kind`; `evidences` edges to each competitor node named in the item's rationale/evidence, and to the project node.
  - Return `partners` and `whitespace` in `counts`.
- `src/components/ecosystem/EcosystemCanvas.tsx` — `partner` colour already defined in the kind map; show archetype/leadership in the node hover title.
- `src/components/ecosystem/NodeDrawer.tsx` — render the new competitor meta fields (archetype, market position with rationale, strong dimensions).
- `src/pages/Ecosystem.tsx` — extend the sync toast with the new counts.
- No migration needed; all data already exists.
