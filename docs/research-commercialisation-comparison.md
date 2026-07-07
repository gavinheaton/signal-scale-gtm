# Research Commercialisation Canvas Platform vs Signal + Scale

A side-by-side comparison of your business partner's proposed *Research Commercialisation Canvas Platform* and the *Signal + Scale* platform already in build.

---

## 1. Executive summary

**Signal + Scale** is a B2B go-to-market (GTM) platform for deep-tech startups. It assumes the team has decided to commercialise and helps them run the GTM motion — defining ICPs and personas, running customer discovery, building value propositions and business-model canvases, planning demand-capture and demand-creation campaigns, producing content, and measuring pipeline and brand impact.

**The partner's platform** is a research-commercialisation workspace for research teams that have *not yet* decided how to commercialise. It guides them through structured evidence-gathering — ecosystem mapping, customer conversations, canvas building, journey mapping and elevator pitch — culminating in an evidence-based recommendation of a commercialisation pathway.

**Headline:** the two products share roughly 60% of their intended modules and the same intellectual lineage (Osterwalder canvases, Steve Blank / Rob Fitzpatrick customer discovery). They differ in **audience** (commercial-ready founders vs pre-commercial researchers), **stage** (execution vs decision), and in the **learning-program layer** the partner's spec assumes.

---

## 2. Audience and positioning

|  | Signal + Scale | Partner's platform |
|---|---|---|
| Buyer | Deep-tech startup founder / GTM lead | Research team, tech-transfer office, or program operator |
| Stage of the commercialisation journey | Post-decision: "we are going to market, help us do it well" | Pre-decision: "should we commercialise, and if so, how?" |
| Primary artefact | Live campaigns, content, pipeline metrics | Evidence dossier and pathway recommendation |
| Delivery model | Self-serve SaaS | Tool + coached learning program |
| Success metric | Pipeline influenced, share of voice, brand search | Confidence in pathway choice, quality of evidence |

Positioned this way, the two products sit one maturity stage apart on the same journey.

---

## 3. Module-by-module mapping

| Partner's module | Signal + Scale equivalent | Status | Notes |
|---|---|---|---|
| Project workspace per team | `projects` under `organisations` with role-based membership | **Built** | Multi-tenant, RLS enforced. |
| Research profile (IP, TRL, inventors, funding stage) | — | **Missing** | No equivalent capture in Signal + Scale. |
| Ecosystem map (users, buyers, partners, influencers, regulators) | `Ecosystem` page + `ecosystem_maps / _nodes / _edges` | **Built** | Kinds: segment, company, role, person, partner, regulator, competitor, channel, influencer, community, theme, insight. Near 1:1 match. |
| Customer conversation records | `Discovery` module | **Built** | Campaigns, orgs, contacts, conversations, insights, next actions. |
| Discover markets that may use/fund/adopt research | `ICP & Personas` + ICP Wizard + fit/access matrix | **Built (adjacent)** | Signal + Scale frames this as ICP segmentation for GTM; partner's spec frames it as market discovery for a not-yet-defined offer. Same underlying data, different framing. |
| Value Proposition Canvas | `ValueProp` page | **Partial** | Page exists and references pains/gains/jobs terminology; needs confirmation it uses the full Osterwalder VPC schema (customer profile: jobs, pains, gains; value map: products, pain relievers, gain creators). |
| Business Model Canvas | `Canvas` page (variants: standard, shared-value, business-model) | **Built** | The `business_model` variant covers all nine BMC boxes. |
| Customer Journey Map for target partners | Campaign journey view in `Campaigns` | **Partial** | Signal + Scale has a campaign-journey view; not a stakeholder-step / decision-barrier map per persona. |
| Elevator Pitch Map | Canvas narrative generator (`canvas-narrative` edge fn) | **Partial** | Produces a narrative from a canvas; not a structured elevator-pitch map with fixed slots. |
| Commercialisation pathway recommendation (spin-out / license / partner / grant) | — | **Missing** | Closest analogue is the ICP fit/access matrix, which classifies **accounts**, not **pathways**. |
| Problem-space / solution-space reframing loop | Discovery module (evidence side only) | **Partial** | Conversations and insights are captured but there is no explicit "reframe the research" artefact. |
| Evidence flow between modules | `ecosystem-sync`, `canvas-sync`, `canvas-suggest`, discovery → ICP wiring | **Built** | Edge functions already move signals between discovery, ecosystem, ICP and canvases. |
| Guided, form-based (not whiteboard) | Wizards for ICP, Persona, Brand Voice, Campaign, Discovery | **Built** | Matches the partner's "must not be a generic whiteboard" requirement. |
| Exportable asset pack | Canvas print view, Notion push, WordPress publish, Propresence/Cowork sync, brand-voice export | **Built** | Publishing surface is much richer than the partner's spec calls for. |
| Learning-program scaffolding (cohorts, facilitator view, coached reflection, module gating) | — | **Missing** | Signal + Scale is self-serve SaaS. |

---

## 4. Strong overlaps (already built in Signal + Scale)

- Multi-org, multi-project workspace with role-based access (owner / admin / manager / analyst / client) and Supabase RLS.
- **Ecosystem module** — matches the partner's ecosystem-mapping intent almost 1:1, including the same "your project at the centre, stakeholders radiating outward" mental model.
- **Discovery module** — customer conversation capture with organisations, contacts, conversations, insights and next actions; supports the partner's "problem-space customer conversations" requirement.
- **ICP + fit/access matrix** — segments markets by strategic fit and reachability; overlaps with the partner's "discover markets that may use, fund, adopt or partner around the research".
- **Value Prop and Canvas pages**, including three canvas variants (standard lean, shared-value, full business model).
- **Evidence flow** — `ecosystem-sync`, `canvas-sync`, `canvas-suggest` edge functions already pull signals from discovery and ICP into the canvases, matching the partner's "evidence should flow between modules" principle.
- **Exports** — Canvas print view, Notion push, brand-voice sync to Cowork/Propresence, WordPress publishing.
- **Guided wizards** for ICP, Persona, Brand Voice, Campaign and Discovery — directly answers "must not be a generic whiteboard".

---

## 5. Gaps in Signal + Scale relative to the partner's spec

1. **Research profile.** No capture of the underlying research capability, IP status, TRL, inventors, funding stage or research questions. Signal + Scale projects start at ICP, not at the science.
2. **Customer Journey Map for target partners.** Signal + Scale has campaign journeys (marketing touchpoints over time), not a stakeholder-step / decision-barrier map per persona.
3. **Commercialisation pathway recommendation.** No module for evaluating spin-out vs license vs partner vs grant-funded vs internal-development pathways against gathered evidence.
4. **Explicit problem-space / solution-space reframing loop.** Discovery captures conversations but does not produce a "how has our understanding of the problem changed?" artefact that repositions the research.
5. **Learning-program scaffolding.** No cohort model, no facilitator dashboard, no module gating, no structured reflection prompts, no coach-visible progress.
6. **Structured Osterwalder VPC schema.** The `ValueProp` page uses pains/gains/jobs terminology; whether it maps cleanly onto the full Osterwalder VPC (customer profile: jobs/pains/gains; value map: products & services / pain relievers / gain creators) needs a design review before claiming parity.

---

## 6. Gaps in the partner's spec relative to Signal + Scale

The partner's spec ends at the "commercialisation pathway recommendation" — everything Signal + Scale does downstream of that is out of scope:

- Campaign planning, including the 95/5 balance between demand-capture and demand-creation.
- Content pipeline and asset production workflow.
- Analytics: brand search volume, inbound referrals, pipeline influenced, share of voice, community engagement.
- Brand voice generation and export.
- Publishing integrations (Notion, WordPress, Propresence / Cowork).
- Multi-project, multi-org tenancy with role-based access (implied but not specified).

---

## 7. Strategic options

These are framed as discussion prompts, not recommendations.

**Option A — One product, extended.** Add research profile, customer journey map, pathway recommendation and reframing loop into Signal + Scale. Highest feature reuse; risks diluting the current GTM positioning and confusing buyers.

**Option B — Two front-ends, shared foundation.** Reuse the Supabase schema (ecosystem, discovery, canvases, ICP) behind a research-focused UI with its own terminology, navigation and learning-program layer. Highest engineering reuse; requires a shared team and clear API boundaries.

**Option C — Two independent products.** Build the partner's platform separately; borrow design patterns and lessons but not code. Cleanest positioning; largest duplicated effort.

**Option D — Partnership / referral.** No product merge. Signal + Scale picks up teams once they graduate from the partner's research-commercialisation program. Lowest coupling; requires trust that the handover artefacts line up.

---

## 8. Open questions to resolve with your partner

1. Is the learning-program layer core to the product, or a light overlay on the tool? (This drives Option A/B/C viability.)
2. Who is the buyer — the research team, the tech-transfer office, the university, or a program operator? Each implies a different sales motion and pricing model.
3. What must the "commercialisation pathway recommendation" be evidence-linked to before you'd trust its output? (This defines the minimum viable evidence graph.)
4. What's the timeline and funding envelope — next-quarter build, 12-month roadmap, or joint-venture conversation?
5. Is there overlap in target customers today? If a research team using the partner's platform "graduates" to commercialisation, is Signal + Scale their next stop, or a competitor?

---

*Prepared as a discussion document. No product decisions have been made.*
