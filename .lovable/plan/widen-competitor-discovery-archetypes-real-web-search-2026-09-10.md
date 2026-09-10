# Widen competitor discovery: archetypes + real web search

## Why CDRI, Resilience Rising, Zurich Alliance, Resilient Cities Network, Arup and Deltares were missed

Checked the discovery code and the ERI records. Three causes, all confirmed:

1. **Only one narrow question is asked.** The AI is told to propose organisations a buyer would evaluate "INSTEAD of this business", capped at 6–10, with at least one in-house and one do-nothing entry. That framing returns engineering consultancies (AECOM, Jacobs, Arcadis, SMEC, GHD) and nothing else — coalitions, alliances and research institutes never fit the question.
2. **No web search at all.** The competitor list is generated purely from the AI's own memory, then each name is looked up to confirm its website. Nothing ever searches the web for "who else does resilience investment work", so anything the model doesn't volunteer is invisible.
3. **Non-commercial bodies are explicitly thrown away.** The website-reading step is instructed to exclude "industry bodies that are not service providers", which discards exactly this class of organisation.

Current ERI list: 9 AI-proposed (all consultancies plus in-house/do-nothing) and 4 from your own site (Value Advisory Partners, Deakin, DNV GL, Smart Energy Council). Arup is absent, and none of the coalitions or research institutes are present.

## What changes

**1. Four archetypes, using your framing**

Every competitor gets an archetype alongside its existing type:

- Scale & capital coalitions — CDRI, Resilience Rising
- Engineering & systems maturity — Arup, GHD, Jacobs, AECOM
- Applied research organisations — Deltares, university institutes
- Hazard & place-specific alliances — Zurich Flood Resilience Alliance, Resilient Cities Network, Value Advisory Partners

Shown as a filter and grouping on the Competitive Landscape page, and as a labelled column in the comparison grid. Existing entries get an archetype assigned in the same pass.

**2. A real web search pass**

Discovery gains a search stage that runs before the AI proposal:

- Build searches from the project's own field of work, one set per archetype (for example "climate resilience investment coalition", "flood resilience alliance", "applied climate adaptation research institute").
- Australia-weighted first round, then a global round, so local players rank above global ones but global bodies still appear.
- Each candidate name found is resolved to its real website and sector-checked exactly as today, so mismatches like the haircare "GHD" are still caught.

**3. Broader AI question**

The AI is asked, per archetype, who else works on this problem — not only who a buyer would hire instead. Non-commercial coalitions, alliances, networks and research institutes are explicitly allowed rather than excluded, both in the AI pass and in the reading of your own website. The result cap rises from 10 to around 30 across all archetypes.

**4. Seeding names yourself**

The existing "add competitor" dialog gains a paste-a-list mode: paste several names (one per line), and each is researched, verified and archetype-classified in the background like any discovered entry.

**5. Recover the named organisations for ERI**

Immediately after the change, run discovery for ERI so CDRI, Resilience Rising, the Zurich Flood Resilience Alliance, Resilient Cities Network, Arup and Deltares are found, verified and saved, and check they appear before reporting back.

## Technical notes

- Migration: `competitor_archetype` enum (`capital_coalition`, `engineering_systems`, `applied_research`, `place_alliance`, `other`) plus a nullable `competitors.archetype` column; no new tables.
- `supabase/functions/_shared/competitorAi.ts`: add archetype definitions with search-query templates, and a `discoverByArchetype()` helper wrapping `fcSearch` + `resolveCompanySite`, run in parallel batches of four to stay inside the function lifetime.
- `supabase/functions/competitor-discover/index.ts`: keep the 202 + `EdgeRuntime.waitUntil` + incremental-save structure. Insert the search pass between the own-site pass and the AI pass; relax the exclusion rules in `OWN_SITE_SYSTEM`; rewrite `SYSTEM` to be archetype-aware; keep name/domain dedupe across all three passes.
- New `competitor-seed` function for the pasted-names path, reusing `resolveCompanySite` and the archetype classifier.
- Frontend: `CompetitiveLandscape.tsx` archetype grouping/filter, archetype badge in the profile drawer and comparison grid, and the paste-list mode in the add dialog.
- Existing rows are backfilled by a one-off classification of current names, so the grouping is not empty on first load.
