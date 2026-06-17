# Brand Audit improvements

Three changes to `BrandAudit.tsx` and `brand-audit-run/index.ts`.

## 1. Delete audit reports

In `src/pages/BrandAudit.tsx`, add a delete affordance per row in Audit History:

- Add a small trash icon button on the right of each run row (stops propagation so it doesn't navigate).
- Confirm via `AlertDialog` ("Delete this audit run? This removes the run and all its scored pages.").
- On confirm: delete child pages first, then the run, then refresh:
  ```ts
  await supabase.from('brand_audit_pages').delete().eq('run_id', id);
  await supabase.from('brand_audit_runs').delete().eq('id', id);
  ```
- Toast success/error and reload.

Also add the same delete button on the `BrandAuditDetail` page header so a user viewing a report can delete it and bounce back to `/project/brand-audit`.

RLS on `brand_audit_runs` / `brand_audit_pages` already scopes by project, so no SQL changes needed.

## 2. Prepopulate website URL

The Brand Voice wizard already stores `brand_identity.website_url` on `brand_voices`. In `BrandAudit.tsx`:

- Extend the existing `load()` query to also select `brand_identity` from the latest brand voice.
- Derive `defaultWebsite = bv?.brand_identity?.website_url ?? ''` and set it into `baseUrl` state on load.
- When the "New Audit" dialog opens, if `baseUrl` is empty, fall back to that derived value.
- Show it pre-filled in the input (user can still edit).

## 3. Better page discovery (find more important pages)

Problem: Firecrawl `map` with `limit: 30` for quick scope is too small and too unranked — last run only surfaced 1 usable page. Fix in `supabase/functions/brand-audit-run/index.ts`:

**Map call changes** (`firecrawlMap`):
- Always request a large pool: `limit: 200` for quick, `limit: 500` for deep.
- Make two parallel `map` calls and merge/dedupe results to bias toward high-value pages:
  1. Plain map (full sitemap).
  2. Map with `search: "about services solutions pricing customers case study blog"` — Firecrawl's `search` param returns links ranked by relevance to those terms, which is exactly what we want.
- Merge: relevance-search results first (in order), then plain-map results, deduped.

**Selection logic** (replace current single-pass filter):
- Apply `EXCLUDE_RE` first.
- Bucket into: `home`, `keyPages` (KEY_PAGE_RE), `blogPages` (BLOG_RE), `rest`.
- Build the final list by interleaving so we always include a healthy spread when the user asks for ~8:
  ```
  [home, ...keyPages.slice(0, max(4, limit-3)), ...blogPages.slice(0, 2), ...rest]
   .slice(0, effectiveLimit)
  ```
- If after filtering we still have fewer than `effectiveLimit` URLs, fall back to including filtered-out `rest` URLs rather than returning a 1-page audit.
- Log the chosen URLs (`console.log("Audit URLs:", urls)`) for debugging.

**Guardrail**: if `urls.length < 2` after all of the above, return a 400 with a clear message ("Couldn't discover enough content pages on this site — try Custom URLs.") instead of silently scoring 1 page.

## Files changed

- `src/pages/BrandAudit.tsx` — delete button + confirm dialog, prepopulate website URL from brand voice.
- `src/pages/BrandAuditDetail.tsx` — delete button in header.
- `supabase/functions/brand-audit-run/index.ts` — dual `map` calls with relevance search, smarter bucket interleaving, fallback + guardrail, debug log.

No DB schema or RLS changes.
