# Competitive landscape narrative + Word export

Add a fourth tab on the Competitive Landscape page — **Narrative** — that writes a board-ready story of the competitive landscape from the data already gathered, and lets you download it as a Word document.

## What you get

- A "Write the narrative" button that reads everything already in the project: confirmed competitors and their research, the comparison grid, who owns what, the market-position assessment (including the persona lens), the whitespace gaps, plus your ICPs, personas and value proposition.
- The narrative appears on screen in readable sections:
  1. Executive summary
  2. The field — who is competing, grouped by type
  3. How buyers compare us (what the grid shows, dimension by dimension)
  4. Where we sit — market traction and differentiation, quadrant by quadrant
  5. Whitespace and counter-positioning angles
  6. Risks and watch list
  7. Recommended moves (next 90 days)
- The saved narrative persists, shows when it was last written, and can be re-written at any time.
- **Download Word** produces a formatted .docx in the project's look (navy headings, orange sub-headings, Poppins), with a title page, contents, and a competitor summary table.
- The narrative is also included in the board pack print view.

## Technical notes

- New table `competitive_narratives` (project_id, persona_id nullable lens, sections jsonb, markdown text, generated_at, model) with GRANTs to `authenticated`/`service_role` and RLS matching the existing project-membership pattern used by the other competitor tables.
- New edge function `competitor-narrative`: `requireUser` + `assertProjectAccess`, loads competitors, `competitor_dimensions`, `competitor_scores`, `competitor_market_positions`, `competitive_whitespace`, ICPs, personas, value propositions and project context, then one Lovable AI Gateway call returning structured JSON per section. Runs as a background run row (reusing `competitor_runs`) with UI polling, same as the market-position assessment, so a long generation can't be lost.
- New `src/components/competitors/NarrativePanel.tsx` for the tab, and `src/lib/competitiveNarrativeDocx.ts` built with the existing `docx` package, following the structure and tokens of `src/lib/personaDocx.ts`.
- `CanvasPrint.tsx` gains the narrative sections after the market-position map.
