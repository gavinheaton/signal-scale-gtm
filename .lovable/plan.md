# Written comparison: Research Commercialisation Canvas Platform vs Signal + Scale

Produce a single shareable document — no code changes, no new app features — that you can send to your business partner as the basis for a conversation.

## Deliverable

One file: `docs/research-commercialisation-comparison.md` (Markdown, ~4–6 pages when rendered). Markdown so it renders in GitHub/Notion and can be pasted into email; if you'd prefer `.docx` for track-changes review, say so and I'll generate that instead.

## Document structure

1. **Executive summary** (½ page)
   - One-paragraph description of each platform in its own words.
   - Headline: ~60% module overlap, different audience and different stage of the commercialisation journey.

2. **Audience & positioning**
   - Signal + Scale: deep-tech startups that have decided to go to market — GTM execution.
   - Partner's platform: pre-commercial research teams deciding *whether and how* to commercialise — evidence gathering and pathway selection.
   - Implication: same intellectual lineage (Osterwalder, customer discovery), positioned one maturity stage apart.

3. **Module-by-module mapping table**

   Columns: Partner's module | Signal + Scale equivalent | Status (built / partial / missing) | Notes.

   Rows cover: Research profile, Project workspace, Ecosystem map, Customer conversations, VPC, BMC, Customer Journey Map, Elevator Pitch, Commercialisation pathway recommendation, Exportable asset pack, Evidence flow between modules, Guided/structured forms vs whiteboard, Learning-program scaffolding.

4. **Strong overlaps** (what's already built)
   - Project/org/membership model with RLS.
   - Ecosystem module — matches partner's ecosystem-mapping intent almost 1:1 (segments, companies, roles, people, partners, regulators, competitors, channels, influencers, communities).
   - Discovery module — customer conversation capture with insights and next actions.
   - ICP + fit/access matrix — overlaps with partner's "discover markets".
   - Value Prop and Canvas pages, including three canvas variants (standard, shared value, business model).
   - Evidence flow: ecosystem-sync, canvas-sync, canvas-suggest edge functions already wire discovery/ICP → canvases.
   - Exports: Canvas print, Notion push, brand-voice sync.
   - Guided wizards for ICP, Persona, Brand Voice, Campaign, Discovery — matches "not a generic whiteboard".

5. **Gaps in Signal + Scale relative to partner's spec**
   - **Research profile** — no capture of underlying IP/capability, TRL, inventors, IP status, funding stage.
   - **Customer Journey Map for partners** — Signal + Scale has campaign journeys, not a stakeholder-step/barrier map per persona.
   - **Commercialisation pathway recommendation** — no module for choosing spin-out vs license vs partner vs grant. Closest is ICP account matrix, which is a different question.
   - **Explicit problem-space / solution-space reframing loop** — Discovery captures conversations but doesn't produce a "research repositioning" artefact.
   - **Learning-program scaffolding** — no cohort model, facilitator view, module gating, or coached reflection prompts. Signal + Scale is self-serve SaaS.
   - **Osterwalder pains/gains/jobs schema on VPC** — flag as "needs verification" pending a look at the Value Prop page fields.

6. **Gaps in partner's spec relative to Signal + Scale**
   - Campaign planning and 95/5 demand-capture vs demand-creation balance.
   - Content pipeline and asset production workflow.
   - Analytics (brand search, referrals, pipeline influenced, share of voice).
   - Brand voice generation and export.
   - Publishing integrations (Notion, WordPress, Propresence/Cowork).
   - Multi-project, multi-org tenancy with role-based access already implemented.

7. **Strategic options** (framed as discussion prompts, not recommendations)
   - **A. One product, extended** — add research profile, journey map, pathway module, reframing loop into Signal + Scale. Risks diluting the GTM positioning.
   - **B. Two front-ends, shared foundation** — reuse the Supabase schema (ecosystem, discovery, canvases) behind a research-focused UI with its own terminology. Highest reuse; needs shared team.
   - **C. Two independent products** — build the partner's platform separately; borrow patterns but not code. Cleanest positioning, most duplicated effort.
   - **D. Partnership / referral** — Signal + Scale picks up teams once they exit the research-commercialisation program. No product merge.

8. **Open questions to resolve with partner**
   - Is the learning-program layer core, or a light overlay on the tool?
   - Who's the buyer — the research team, the tech-transfer office, the university, or a program operator?
   - What does "commercialisation pathway recommendation" have to be evidence-linked to before you'd trust its output?
   - Timeline and funding: is this a next-quarter build or a joint-venture conversation?

## What this plan does not do

- No code, no schema, no new pages.
- No decision on options A–D — that's for you and your partner.
- No pricing or business-model analysis unless you want that section added.

## Tell me before I build

- Format: Markdown (default) or `.docx`?
- Any section to drop, expand, or reframe?
