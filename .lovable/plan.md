## Goal

When the wizard reaches the **Writing Samples** section, stop asking the user to paste samples. Instead, discover the company's blog from their website, fetch the most recent posts, analyse them, and validate them against the tone of voice that's been developed so far.

## Current state

`supabase/functions/brand-voice-wizard/index.ts` only fetches the literal URLs the user types (lines 366–394, raw `fetch` + tag stripping, 4000-char cap, max 2 URLs). It has no concept of "find the blog" or "pick recent posts", and `writing_samples` is currently populated by asking the user to paste content.

We already have the **Firecrawl** connector linked (`FIRECRAWL_API_KEY` is in secrets) — same one Brand Audit uses — so we can do this server-side without any new infra.

## Plan

### 1. New helper inside `brand-voice-wizard/index.ts`: `discoverWritingSamples(websiteUrl)`

- **Map the site** with Firecrawl `POST /v2/map`, `search: "blog"`, `limit: 50`, `includeSubdomains: true`. This returns ordered candidate URLs.
- **Filter to post-like URLs** — keep links whose path contains `/blog/`, `/insights/`, `/articles/`, `/news/`, `/resources/`, `/posts/`, or sits one level deeper than `/blog`. Drop tag/category/author/pagination pages (`/tag/`, `/category/`, `/author/`, `/page/`).
- **Pick 3 candidates** — take the top 3 after filtering (Firecrawl's map already biases to relevance for the `blog` search term, which tends to surface recent posts).
- **Scrape each** with Firecrawl `POST /v2/scrape`, `formats: ['markdown']`, `onlyMainContent: true`. Capture `title`, `sourceURL`, first ~1,500 chars of markdown, and `publishedTime` from metadata when available.
- Sort by `publishedTime` desc when present, fall back to map order. Return the top 3.

Wrap in try/catch — if Firecrawl errors or returns nothing, the wizard falls back to the current "ask the user to paste a sample" flow with a brief note about why discovery failed.

### 2. Trigger discovery at the right turn

Inside the request handler, after we resolve `messages` and `existingDraft` and before building the Anthropic call:

- If `writing_samples` is the next gap (i.e. not in `sections_complete`, and earlier sections like `personality_adjectives` / `tone_description` are complete enough to validate against), AND `brand_identity.website_url` (or the originally captured site URL on the brand_voices row) is known, AND we haven't already attempted discovery this session (track `samples_discovery_attempted` flag in `draft_output`), run `discoverWritingSamples`.
- Inject the result into the system prompt as a new `DISCOVERED WRITING SAMPLES` block containing title, URL, and excerpt for each post.
- Append a one-turn instruction telling the assistant to:
  1. Show the 3 discovered samples to the user (titles + URLs only, not full text).
  2. Analyse each against the developing voice — for every sample, report **what aligns** with the current `personality_adjectives` / `tone_description` / `writing_principles`, and **where it drifts** (banned phrases triggered, principle violations, tone mismatch).
  3. Populate `writing_samples` in `<draft>` with `{type: "blog", sample: "<short excerpt + URL>"}` entries.
  4. Ask the user one focused question: do these samples represent the voice you want going forward, or should we treat the drift as the gap to close?

### 3. Persist discovery state

- Add a top-level boolean `samples_discovery_attempted` to the draft schema in the fallback prompt + merge logic so we don't re-run discovery on every follow-up.
- Store the discovered URLs in `draft_output.discovered_sample_urls` (array) so the UI can show them later in `BrandVoicePreviewPanel` if useful (out of scope to render here — just store).

### 4. Resolve the website URL

Today the URL comes from whatever the user typed in turn 1. Make it more robust:

1. Check `existingDraft.brand_identity.website_url`.
2. Else, scan `messages` for the first http(s) URL the user sent and treat that origin as the site.
3. Else, skip discovery and stay on the ask-the-user path.

### 5. Tone-validation prompt block

Add a small, reusable block appended to the system prompt only on the discovery turn:

```
WRITING SAMPLES VALIDATION:
- For each discovered sample, score alignment to the *current* draft (1–5) on: personality_adjectives match, tone_description match, writing_principles match.
- Call out any banned_phrases that appear verbatim.
- If alignment is high, mark writing_samples complete in sections_complete.
- If drift is high, explain the gap and ask whether the user wants to (a) keep the current voice and treat existing content as legacy, or (b) update the voice to reflect how they actually write today.
```

## Out of scope

- No DB schema changes.
- No UI changes in `BrandVoiceWizard.tsx` — the new behaviour appears as a normal assistant turn.
- ICP / Persona wizards untouched.
- We won't crawl every blog post — 3 recent is enough to validate voice without burning Firecrawl credits or hitting the 60s function timeout.

## Technical notes

- Firecrawl map + 3 scrapes typically completes in 8–15s; well within the edge function budget. Scrapes run in parallel (`Promise.all`).
- Excerpts capped at ~1,500 chars each to keep the Anthropic system prompt under control.
- Failures are soft — the wizard always falls back to asking the user.

Want me to build this?