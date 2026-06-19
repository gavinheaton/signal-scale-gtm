# Fix discovery-find-orgs: return real organisations, not social posts

## Problem
For campaign `9cf5a67f...`, the search query was:
> "Australian fintechs - pre Series A Advertising for VAs Posting on social channels sporadically (they post but not regularly) Founder profile mentions 'founder-led marketing' or 'personal brand'"

Firecrawl returned 10 hits — all Instagram reels, LinkedIn posts, YouTube videos about the topic, not actual company pages. The AI scoring step then could not identify any organisations because no hit corresponded to a real company. Two root causes:

1. **Query construction mixes firmographic filters with behavioural signals.** Behavioural phrases ("posting sporadically", "founder-led marketing") match social content, not company sites.
2. **No domain filtering.** Aggregator/social URLs (instagram.com, linkedin.com/posts, youtube.com, tiktok.com, facebook.com, reddit.com, medium.com posts) are kept as candidates.
3. **AI prompt allows hallucinated/empty `name`.** Nothing requires `name` and `domain` to be non-empty real company values.

## Solution

### `supabase/functions/discovery-find-orgs/index.ts`
1. **Split signals into firmographic vs behavioural** with a small classifier prompt OR a deterministic rule: a signal is "firmographic" if it contains industry/geography/size/stage/regulatory keywords (industry:, size:, geography:, region, country names, "Series", "regulated", "ISO", "B-Corp", "ASX", "listed", revenue/$). Everything else is behavioural and is NOT injected into the search query — but is still passed to AI scoring as context.
2. **Build a search query** as: `target_segment` + top firmographic signals + the literal word "companies". Cap to ~120 chars.
3. **Run up to 3 targeted Firecrawl searches in parallel**, each with a slightly different angle (e.g. `<segment> companies list`, `<segment> directory`, `<segment> <top firmographic>`). Dedupe hits by hostname.
4. **Filter hits by domain**: drop hosts in a blocklist (`instagram.com`, `facebook.com`, `tiktok.com`, `youtube.com`, `linkedin.com/posts`, `linkedin.com/in/`, `reddit.com`, `twitter.com`, `x.com`, `medium.com`, `substack.com`, `pinterest.com`, news aggregators). Keep `linkedin.com/company/...` because that is a real org page. Also drop URLs whose path contains `/reel/`, `/posts/`, `/video/`, `/watch`.
5. **Derive a candidate org per remaining hit** before AI scoring: extract apex domain (eTLD+1 via a small helper) and a best-guess name from `title` (strip site suffixes like " | LinkedIn", " - Crunchbase"). Pass `hits_with_apex` to the AI.
6. **Tighten the AI scoring prompt**: require every candidate to have a non-empty `name` AND a `domain` that matches one of the supplied `hits_with_apex` entries; if none of the hits represent a real organisation, return `{"candidates": []}` with a short `note`. Allow the AI to merge several hits into one candidate when they share an apex.
7. **Filter the AI output server-side**: drop candidates whose `domain` isn't in the apex set or whose `name` is empty / matches the blocklist domain. Log how many were dropped.
8. **Surface diagnostics** in the response when zero candidates: include `query_variants`, `raw_hit_count`, `filtered_hit_count`, and a couple of dropped sample titles so the UI toast explains what happened.

### `src/components/discovery/OrganizationsTab.tsx`
- Extend the existing zero-candidates toast to surface `raw_hit_count` vs `filtered_hit_count` when present (e.g. "10 results, 0 looked like company sites — try adjusting qualifying signals").

## Out of scope
- No schema changes.
- No change to `discovery-suggest-qualifying-signals` (already shipped).
- No change to the form UI.

## Technical notes
- Apex extraction: simple regex on hostname, take last two labels (handle `.co.uk`, `.com.au` with a tiny suffix list).
- Behavioural-signal detection is deterministic regex; the goal is just to keep them out of the web-search query string, not perfect classification.
- Parallel Firecrawl calls use `Promise.all`; cap to 3 to limit credit usage.
