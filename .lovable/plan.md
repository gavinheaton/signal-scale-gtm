# Two-stage discovery: scrape articles to extract companies + leadership

## Problem
Stage-1 web search often returns listicles, news pieces, or directory pages ("Top 10 Australian fintechs", "X Best AI startups") rather than individual company sites. We currently drop these as non-companies, leaving the user with no candidates. But these articles often LIST many qualifying companies inside them — including founder/CEO names.

## Solution: add a second stage that scrapes article hits and extracts mentioned companies.

### `supabase/functions/discovery-find-orgs/index.ts`

Pipeline becomes:

1. **Stage 1 — Search (unchanged)**: run up to 3 Firecrawl `/v2/search` queries, normalise hits.
2. **Stage 1 classification (new)**: instead of hard-dropping social/aggregator/article hits, split filtered hits into:
   - `direct_candidates` — hits whose apex looks like an actual company (current logic).
   - `article_sources` — listicles, news, directory pages (linkedin.com/posts, medium, substack, news domains, paths matching `/best-`, `/top-`, `/list`, `/companies/`, dated paths) where the *content* is likely to contain multiple company names.
   - Hard-drop only pure social/video noise (instagram reels, youtube shorts, tiktok, twitter/x posts).
3. **Stage 2 — Scrape articles (new)**: in parallel (capped at 5), call Firecrawl `/v2/scrape` with `formats: ['markdown']`, `onlyMainContent: true` for each `article_source`. Truncate markdown to ~6000 chars per article to control AI tokens.
4. **Stage 2 extraction (new, AI)**: one Lovable AI call (`google/gemini-2.5-flash`) with system prompt:
   - Input: per-article `{ url, title, markdown }` + campaign `target_segment`, `qualifying_signals`, `disqualifying_signals`.
   - Task: extract every distinct ORGANISATION mentioned that plausibly fits the segment. For each, return `{ name, domain (best guess apex or null), source_article_url, mention_context (short quote), leadership: [{ name, role }] (only if explicitly mentioned in the article — never fabricate) }`.
   - Hard rules: never invent names or roles; if no real orgs found, return `[]`.
5. **Merge + dedupe**: combine `direct_candidates` with extracted candidates from articles. Dedupe by `(domain || name.toLowerCase())`. Prefer entries that have leadership info.
6. **Stage 3 — Score (current logic, extended)**: pass the merged candidate set through the existing scoring AI call, but with the extra `leadership` field preserved through to the response.
7. **Return shape** adds optional `leadership: [{ name, role }]` per candidate and a `mention_context` source quote where applicable. Diagnostics include `articles_scraped`, `extracted_from_articles`, alongside existing fields.

### Schema change: store leadership on `discovery_organizations`
- Migration: add column `leadership jsonb not null default '[]'::jsonb` on `public.discovery_organizations` (re-use existing grants/RLS, no other table changes).
- Update `src/types/discovery.ts` `DiscoveryOrganization` to include `leadership: { name: string; role?: string }[]`.

### `src/components/discovery/OrganizationsTab.tsx`
- In the inline `SearchPanel` candidate list, when a candidate has `leadership`, render a small "Leaders identified" row of badges (e.g. `Jane Doe · CEO`).
- When saving, include `leadership` in the insert payload.
- In the org table, add a new "Leaders" column showing up to 2 names with `+N` overflow; click opens a small popover with the full list (use existing `Popover`).
- Inline diagnostics extended to show `articles_scraped` and `extracted_from_articles` counts.

## Notes
- Firecrawl credit usage rises (≤5 extra scrape calls per search). Surface this in the panel description: "Scrapes up to 5 article sources to extract companies + named leaders."
- Leadership is **only** captured when the article explicitly names them — guards against hallucination via the strict system prompt + post-validation that each `leadership.name` substring appears in the source markdown (drop entries that fail this check).
- No change to `discovery-find-roles` — that remains the per-org deep dive after an org is saved.

## Out of scope
- No change to `discovery-suggest-qualifying-signals`.
- No change to disqualifying logic.
- No new edge functions.
