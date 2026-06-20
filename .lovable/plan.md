# Why we're getting zero results

There is **no time restriction** on the Firecrawl search. The pipeline isn't too narrow at the search step — it's too narrow at the *scoring* step, and Stage 2 scraping is silently failing.

From the last run's logs:

```text
variants: 3 search queries
raw hits: ~24
  → direct candidates: 8   (company sites / LinkedIn /company/ pages)
  → article sources:  13   (listicles, news, blogs)
  → dropped:           3   (social/video noise)
scrape attempts: 5 → only 1 returned usable markdown
extracted from articles: 0
merged candidates: 7
AI scoring kept: 0   ← this is where the zero comes from
```

So the funnel is finding plenty of raw material; the **Stage 3 ICP-scoring AI is rejecting every direct candidate** because the search snippet doesn't *prove* they meet vague signals like "bootstrapped or seed-funded". And Stage 2 only ever sees 1 article because 4 of 5 scrapes return empty/paywalled markdown that we silently drop.

# Plan to fix

## 1. Surface the real diagnostics
Currently when zero candidates come back the debug block hides *why* scrapes failed and *why* scoring rejected items. Add to the response:

- Per-scrape outcome: `{url, http_status, markdown_length, kept: boolean}` for all 5 attempts.
- The full AI `note` from Stage 3 (already captured, but only on empty path — also include on partial results).
- For each merged candidate that scoring dropped: name + AI's stated reason (ask the model to emit `dropped:[{name, reason}]` alongside `candidates`).

## 2. Improve Stage 2 scrape yield
- Bump scrape attempts from 5 → 8 article sources.
- Add `waitFor: 1500` and retry once on empty markdown with `onlyMainContent: false`.
- Log every non-2xx Firecrawl status with the response body (first 300 chars).

## 3. Loosen Stage 3 scoring (the actual cause of zero)
Currently the prompt says "Skip orgs clearly matching a disqualifying_signal" but in practice Gemini also skips orgs where signals are *unverified*. Change the prompt to:

- **Default to include** any candidate whose name/domain plausibly matches the `target_segment`. Only exclude on a *clear* disqualifying-signal match.
- Treat `qualifying_signals` as scoring hints, not gates. Return `matched_signals: []` if none are visible — do not drop the candidate.
- Add a `confidence: "high"|"medium"|"low"` field so the UI can show uncertainty instead of us hiding the row.

## 4. Confirm: no time filter exists, and won't be added
Firecrawl `tbs` (time filter) is not set anywhere. Search results span all time. We will keep it that way.

# Technical changes

- `supabase/functions/discovery-find-orgs/index.ts`
  - Replace scrape block with retry + status capture; collect `scrape_outcomes` array.
  - Bump `toScrape` slice from 5 to 8.
  - Rewrite Stage 3 system prompt per §3; add `confidence` to output schema and to `validated` mapping.
  - Always include `scrape_outcomes`, `ai_note`, and `ai_dropped` in the response (not just on empty).
- `src/components/discovery/OrganizationsTab.tsx`
  - Diagnostics block: render per-scrape outcomes (url + status + kept) and the list of names the AI dropped with reasons.
  - Candidate cards: show `confidence` badge next to the tier.
- `src/types/discovery.ts`
  - Add `confidence?: "high"|"medium"|"low"` to `DiscoveryOrganization`.
- Migration: add `confidence text` column to `discovery_organizations` (nullable, no default).

# Out of scope
- No change to Stage 1 query construction.
- No new edge functions.
- No time filter added or removed (none exists).
