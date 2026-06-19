## Fix `discovery-find-orgs` 500 error

**Root cause:** Firecrawl v2 `/search` returns hits in a shape the function doesn't handle, so `hits` ends up as a non-array (object), and `hits.slice(...)` throws `hits.slice is not a function` (visible in edge function logs).

Firecrawl v2 search response shape is typically:
```
{ success: true, data: { web: [ { title, url, description }, ... ], news: [...], images: [...] } }
```
The current code reads `searchData?.data || searchData?.web?.results`, which on v2 returns the `data` object (not an array).

### Fix

In `supabase/functions/discovery-find-orgs/index.ts`, normalize hits across possible Firecrawl response shapes:

- If `searchData.data` is an array → use it (v1 style).
- Else if `searchData.data.web` is an array → use it (v2 style).
- Else if `searchData.web` is an array → use it.
- Else → `[]`.

Also defensively coerce to array before `.slice`, and map fields tolerantly (`title`, `url`, `description` or `snippet`/`markdown`).

Return `{ candidates: [] }` cleanly when no hits, and keep existing AI scoring path unchanged.

No DB, no UI, no other functions touched.