# Fix: council search finds companies but shows zero

## What's actually happening

The search is working. The most recent run for this campaign (04:38 today) completed successfully and produced **59 candidates** — Albury City Council, Armidale Regional Council and the rest of the NSW council list, each with a domain, tier, matched signals and rationale, scraped from the LGNSW and NSW Office of Local Government directories.

But `discovery_organizations` for that campaign has **0 rows**. The candidates are sitting in the `discovery_search_runs` row and were never saved.

Reason: saving happens only in the browser. The edge function returns a run id, the panel polls the run row, and only when the poll sees `status = 'complete'` does it insert the organisations. That run took ~62 seconds; if the panel is closed, the tab navigates, or the poll loop is torn down before completion, nobody ever writes the rows — the work is finished and silently discarded.

## The fix: persist on the server

Move saving out of the browser and into the background job, so results land in the database whether or not anyone is watching.

- In `discovery-find-orgs`, after scoring, the background pipeline itself inserts the candidates into `discovery_organizations` (source `firecrawl`), deduping against existing rows on that campaign by lower(domain) then lower(name) — the same rule the frontend uses today.
- The run row records `saved_count` and `skipped_count` alongside `candidates` and `debug`, so the UI can report what happened.
- `SearchPanel` stops inserting. On `complete` it just reads `saved_count` / `skipped_count`, shows the summary and diagnostics, and refreshes the organisation table. Re-attaching to a running job keeps working; results now show even when the user returns after the run finished.
- Reattach also covers recently finished runs, not just `running` ones, so reopening the panel shortly after a search shows the outcome instead of an empty state.

## Recovering this run

The 59 councils already produced are still stored. As part of this change, the panel gets an explicit "Import results" action for the newest completed run of the campaign, so this existing run's candidates can be saved without re-searching (and re-spending Firecrawl credits).

## Technical notes

Files touched: `supabase/functions/discovery-find-orgs/index.ts` (insert candidates in the background pipeline, write counts to the run row), `src/components/discovery/OrganizationsTab.tsx` (poll reads counts instead of inserting; reattach to latest run; import action). Migration adds `saved_count` and `skipped_count` integer columns to `discovery_search_runs`. No change to query generation, scraping, scoring, or the candidate shape.
