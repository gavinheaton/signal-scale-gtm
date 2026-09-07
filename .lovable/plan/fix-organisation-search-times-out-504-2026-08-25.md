# Fix: organisation search times out (504)

## What's happening

The console shows `discovery-find-orgs` returning **504** (gateway timeout), which the UI surfaces as "Edge Function returned a non-2xx status code". The search is not failing logically — it simply takes too long to answer in a single HTTP request. Each run does, in sequence:

1. one AI call to write search queries,
2. four Firecrawl searches, sequential, with 1.2s gaps and up to 3 retries with 2.5–7.5s backoff on rate limits,
3. up to eight page scrapes, two at a time, with 1.5s gaps and 3–9s backoff on rate limits, each with a second retry pass,
4. an AI extraction call, then an AI scoring call.

On a slow or rate-limited run that comfortably passes the gateway's response window, so the browser gets a 504 even though the function keeps working in the background (the logs show it completing its scrape and extraction stages).

## The fix: make search a background job

Stop making the browser wait on the whole pipeline.

- New table `discovery_search_runs` (campaign-scoped, RLS + grants matching the other discovery tables): `status` (`running` / `complete` / `error`), `candidates` jsonb, `debug` jsonb, `error` text, timestamps.
- `discovery-find-orgs` changes to: authenticate, check campaign access, insert a `running` run row, return `{ run_id }` immediately, and continue the existing pipeline in the background (`EdgeRuntime.waitUntil`). On finish it writes candidates + debug and flips status to `complete`; on throw it writes the message and flips to `error`.
- `SearchPanel` in `OrganizationsTab.tsx` calls the function, then polls the run row every ~3s (with a hard stop after ~5 minutes) and renders the same candidate list and debug block it does today. While polling it shows a progress state ("Searching the web for organisations — this can take a couple of minutes") instead of a spinner that can only end in a timeout.
- Because the run is persisted, navigating away and back re-attaches to the newest `running` run for the campaign instead of losing the work.

## Also making the pipeline faster

Independent of the timeout fix, trimming wall-clock reduces rate-limit thrash:

- Run the four Firecrawl searches concurrently rather than sequentially (keep per-query 429 backoff).
- Cap scrapes at 6 and raise concurrency to 3, dropping the fixed inter-batch sleeps in favour of backoff only when a 429 actually comes back.
- Skip the second full-page scrape retry when the first pass already returned usable markdown.

## Small unrelated error in the same console output

`brand_voices?select=status&...&limit=1` returns **406** because `src/pages/Home.tsx` uses `.single()`, which errors when a project has no brand voice row yet. Switching that call to `.maybeSingle()` clears the noise.

## Technical notes

Files touched: new migration for `discovery_search_runs`, `supabase/functions/discovery-find-orgs/index.ts`, `src/components/discovery/OrganizationsTab.tsx`, `src/pages/Home.tsx`. No change to the candidate shape, dedupe logic, or the save-to-organisations flow.
