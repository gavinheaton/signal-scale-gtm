# Competitive Landscape

Your methodology already lists a "Competitors" step on the project Home stepper, but nothing sits behind it — there is no page and no place in the system that stores competitors today. That is why you cannot find it. This plan builds it.

## What you'll get

A new **Competitive Landscape** page in the left sidebar (Phase 4, between Discovery and Ecosystem), with three parts:

**1. Competitor profiles**
- Press **Find competitors** and the system reads your ICPs, personas, value proposition and problems worth solving, then researches and proposes a shortlist of likely rivals with a one-line reason for each.
- Each suggestion arrives as a card you **Confirm**, **Edit** or **Dismiss** — nothing is saved to your landscape until you confirm it.
- A confirmed competitor gets a full profile: website, positioning statement, target segments, key claims and proof points, pricing signals, strengths, weaknesses, and where the evidence came from. You can also add a competitor manually and have it researched, and re-research any profile later.
- Type field so you can separate direct rivals, adjacent players, in-house/DIY alternatives and "do nothing".

**2. Positioning comparison grid**
- A table of you versus each confirmed competitor across the dimensions that matter to your buyers (dimensions suggested by AI from your ICP, fully editable, reorderable).
- Each cell holds a short claim plus a simple strong / parity / weak rating, so the grid reads at a glance and prints cleanly.

**3. Whitespace & counter-positioning**
- A **Find the gaps** action that reads the grid and the profiles and returns: dimensions nobody credibly owns, claims everyone makes (so they are worthless), and two to three counter-positioning angles that are yours to take.
- Each angle has one-click actions: **Send to value prop** (fills your "unlike" contrast and appears as a variation) and **Send to canvas** (adds it as an AI suggestion in the Unfair Advantage / USP box, which you then accept or reject as usual).

## Connections to the rest of the platform

- **Ecosystem map**: confirmed competitors sync in as competitor nodes on the next "Sync from data", linked to the segments they target and to any of your discovery organisations they compete for.
- **Canvas**: competitor claims and confirmed whitespace feed the AI suggestions for Unfair Advantage, USP and Customer Segments on all three canvases, and appear as sourced context in the critique.
- **Value prop**: whitespace angles can be pushed into the "unlike" field and saved as variations.
- **Home stepper**: the Competitors step becomes clickable and reports its own progress — not started with no competitors, in progress once some are confirmed, complete once the grid and whitespace are done.

## Technical notes

New tables (external Supabase, RLS via the existing project-membership pattern, with explicit GRANTs):
- `competitors` — project_id, name, domain, type enum (direct | adjacent | in_house | do_nothing), status enum (suggested | confirmed | dismissed), positioning, target_segments jsonb, claims jsonb, proof_points jsonb, pricing_signals, strengths jsonb, weaknesses jsonb, evidence jsonb (source urls + capture dates), confidence, researched_at, created_at.
- `competitor_dimensions` — project_id, label, description, position.
- `competitor_scores` — dimension_id, competitor_id nullable (null = us), claim text, rating enum (strong | parity | weak).
- `competitive_whitespace` — project_id, kind enum (unowned | commoditised | counter_position), title, rationale, evidence jsonb, applied_to jsonb, created_at.

New edge functions, following the existing background-job pattern used by `discovery-find-orgs` (immediate 202 + `EdgeRuntime.waitUntil` + a run row the UI polls) so long research never hits a gateway timeout:
- `competitor-discover` — AI proposes candidates from project context, Firecrawl search/scrape verifies each domain resolves and belongs to the named company.
- `competitor-enrich` — scrapes a confirmed competitor's site for positioning, claims, proof points and pricing signals; every field carries its source url.
- `competitor-whitespace` — reads dimensions, scores and profiles; returns gaps, commoditised claims and counter-positioning angles.

All three call the Lovable AI Gateway on the existing default chat model with strict JSON schemas, and surface gateway 402/403 as clear messages rather than silent failures. `ecosystem-sync` gains a competitor pass; `canvas-suggest` and `canvas-critique` gain competitor context; `value-prop-assist` accepts a whitespace angle as a seed.

Frontend: `src/pages/CompetitiveLandscape.tsx` with three tabs, `src/components/competitors/*` (suggestion review list, profile drawer, comparison grid, whitespace panel), a `src/types/competitors.ts`, a sidebar entry and a route in `App.tsx`. Print support reuses the existing print-route approach so the grid can go into the board pack.

Every AI-derived field is labelled as a suggestion with its source, and nothing enters your landscape without your confirmation.
