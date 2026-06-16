# Brand & Content Health System — Phased Roadmap

A closed-loop system that audits the client's website against their **ICP, personas, and brand voice**, scores every page, tracks **Brand Health** over time, and surfaces an SEO/AEO specialist layer on top — always filtered through "does this serve the ICP?"

```text
Foundations (already built)          New layers
┌───────────────────────────┐        ┌────────────────────────────────┐
│ ICP · Personas · Voice    │ ────▶  │ Phase 1: Brand Content Audit   │
└───────────────────────────┘        │ Phase 2: Brand Health (trend)  │
                                     │ Phase 3: SEO/AEO Deep-Dive     │
                                     └────────────────────────────────┘
```

---

## Phase 1 — Brand Content Audit (foundational)

**Goal:** crawl the client's website, score each page against brand voice + ICP/persona fit + clarity, produce a per-page report and a headline Brand Health Score.

### New sidebar item
`Brand Audit` (between Brand Voice and Campaigns).

### Pages
1. **Audit Hub** (`/project/brand-audit`)
   - Empty state: "Run your first audit" with two modes:
     - **Quick audit** — home + about + top 5–10 pages (auto-detected from GSC if connected, else sitemap top-level).
     - **Deep audit** — full crawl (Firecrawl `crawl`, capped at e.g. 200 pages).
   - Once an audit exists: headline Brand Health Score (0–100), sub-score chips, last-run timestamp, "Re-audit now" button, history list.

2. **Audit Run Detail** (`/project/brand-audit/:runId`)
   - Score breakdown (sub-scores → headline).
   - Sortable/filterable page table: URL · Voice · ICP Fit · Persona Fit · Clarity · Overall · Status (on-brand / drifting / off-brand).
   - Click a row → **Page Drill-Down**: scraped excerpt, per-dimension reasoning, top 3 recommended fixes, "Which persona this page serves best."

3. **Page Drill-Down** (`/project/brand-audit/:runId/page/:pageId`)
   - Side-by-side: scraped content vs brand voice rules it violates.
   - Persona-fit explanation (which persona, which pain points addressed/missed).
   - Recommended rewrites (AI-generated, copy-to-clipboard).
   - "Mark as reviewed" / "Mark fixed" actions feed the next re-audit's delta.

### Scoring model (sub-scores → headline)
Each page is scored 0–100 on:
- **Voice Match** — tone, vocabulary, banned words, sentence structure vs `brand_voices` record.
- **ICP Relevance** — does the page speak to a defined ICP segment? Industry, role, problem language match.
- **Persona Fit** — which persona(s) this page serves, alignment with their pain points + goals.
- **Clarity & Structure** — readability, heading hierarchy, CTA presence, message pyramid.

**Headline Brand Health Score** = weighted average (defaults: Voice 30 / ICP 30 / Persona 25 / Clarity 15). Weights stored per-project so users can tune.

Page-level status thresholds: **on-brand** ≥80, **drifting** 60–79, **off-brand** <60.

### Required connectors
- **Firecrawl** (already available in workspace, not yet linked) — for scrape + crawl + branding extract.

### Out of scope for Phase 1
Scheduling, trend charts, SEO-specific recommendations (those come in Phases 2 and 3).

---

## Phase 2 — Brand Health (periodic + trend tracking)

**Goal:** turn one-off audits into a living health signal.

### Triggers (all three)
- **Scheduled** — per-project cadence (weekly / monthly), pg_cron + pg_net calling the audit edge function.
- **On-demand** — "Re-audit now" button on Audit Hub.
- **Auto on new content** — daily sitemap diff (and/or GSC "new URLs"); newly published pages are audited automatically and surface a notification.

### New UI on Audit Hub
- **Brand Health trend** — line chart of headline score over time, with sub-score toggles.
- **Drift alerts** — pages whose score dropped >10 points since last run.
- **New-content feed** — recently published pages with their first-audit score and the persona they best serve.
- **"Wins" feed** — pages that moved from off-brand → on-brand (closes the loop for clients).

### Notifications
- In-app badge on the Brand Audit nav item when there are unreviewed drift alerts or new-content audits.
- Optional weekly digest email (Brevo connector — already in workspace).

### Out of scope for Phase 2
SEO-specific signals (Phase 3).

---

## Phase 3 — SEO/AEO Deep-Dive

**Goal:** specialist layer that analyses each page like an SEO/AEO pro, with recommendations always tied back to ICP intent.

### Connection
**Google Search Console** (already available in workspace, not yet linked) via the connector gateway. Per-project property selection in Settings.

### What it analyses (per page)
- **Search intent match** — does on-page content match the queries it actually ranks for (from GSC)? Misalignment is flagged.
- **E-E-A-T signals** — author, dates, citations, schema presence.
- **AEO readiness** — answer-first paragraphs, FAQ schema, question-shaped H2s, scannable structure (what AI Overviews / LLM answer engines reward).
- **Technical SEO basics** — title, meta description, canonical, OG, H1 uniqueness, internal links, alt text.
- **Topical authority** — does this page belong to a cluster targeting the ICP's information needs? Orphan pages flagged.
- **Keyword/topic gaps** — queries the ICP would search for that the site doesn't rank for (Semrush optional, not assumed).

### New scoring dimension
Adds **SEO Health** and **AEO Readiness** sub-scores to the page record. Headline Brand Health weighting reconfigured (defaults: Voice 25 / ICP 25 / Persona 20 / Clarity 10 / SEO 10 / AEO 10).

### Recommendations engine
Prioritised, ICP-filtered:
> "Page X ranks #14 for *deep-tech go-to-market consulting* — this query matches **Persona: VP Marketing at Series A deep-tech**. Rewriting the H1 and adding an answer-first intro could move it to page 1. **Suggested H1:** …"

Recommendations are copy-to-clipboard and (Phase 3+) push-to-Notion via the existing Notion integration.

### New page
**SEO Audit** sub-tab on the audit run detail (or its own `/project/seo-audit`, TBD during build).

---

## Cross-cutting technical notes (for build phases)

### Data model (new tables)
- `brand_audit_runs` — id, project_id, run_type (quick/deep/scheduled/auto), status, headline_score, sub_scores jsonb, started_at, completed_at, page_count.
- `brand_audit_pages` — id, run_id, project_id, url, title, scraped_excerpt, sub_scores jsonb, overall_score, status, persona_fit_ids uuid[], recommendations jsonb, reviewed_at.
- `brand_audit_schedules` — id, project_id, cadence (weekly/monthly), next_run_at, enabled.
- `seo_audit_findings` — id, page_id, finding_type, severity, message, recommendation, dismissed.
All tables RLS-scoped via the existing `projects → org_memberships` pattern. Standard GRANTs to `authenticated` and `service_role`.

### Edge functions (new)
- `brand-audit-run` — orchestrates crawl + scoring; uses Firecrawl + Lovable AI Gateway (Anthropic) with a system prompt that ingests the project's brand voice + ICPs + personas.
- `brand-audit-schedule` — cron entry point.
- `brand-audit-detect-new-content` — daily sitemap/GSC diff.
- `seo-audit-page` — per-page SEO/AEO analysis, GSC gateway calls.

### Connectors to link (when respective phase is built)
- Phase 1: Firecrawl.
- Phase 2: Brevo (optional, only if digest emails are wanted).
- Phase 3: Google Search Console.

### What we are **not** doing
- No automatic rewriting/publishing of client content.
- No raw SQL execution from edge functions.
- No per-end-user OAuth (workspace-owner connections only).

---

## Suggested build order

1. Phase 1 ships first as a complete, useful product on its own (one-shot audit + report).
2. Phase 2 layers scheduling + trend on top of the same data model — no rework.
3. Phase 3 is the specialist add-on, gated on the GSC connection being linked.

If you approve, I'll come back and ask which **Phase 1 slice** to build first (e.g. quick-audit MVP vs full audit + drill-down), so we can ship something demonstrable fast.
