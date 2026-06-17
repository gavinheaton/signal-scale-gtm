## 1. Prepopulate website URL (actually work)

**File:** `src/pages/BrandAudit.tsx`

Today `load()` reads `brand_voices.brand_identity.website_url` from the latest row by `created_at`. If the latest BV is a draft with no `brand_identity` yet, or `website_url` was never captured, the field is blank.

Make it robust with a chain of fallbacks:
1. Latest **completed** `brand_voices.brand_identity.website_url` (filter by `status = 'complete'`, then fall back to any latest row).
2. Most recent prior `brand_audit_runs.base_url` for this project (skip empty/custom-only).
3. Empty.

Also:
- Set `baseUrl` from this derived value on every project change (currently only sets if `prev` is empty — stale state from a previous project sticks).
- In `openDialog()`, always reset `baseUrl` to `defaultWebsite` if the user hasn't manually typed something different this session. Tracked via a simple `userEditedRef` flag set in the input's `onChange`.

## 2. Stop scoring blog/insights index & category pages

**File:** `supabase/functions/brand-audit-run/index.ts`

Right now `/blog`, `/insights`, `/news` (bare index pages) match `BLOG_RE` and get picked as content. They're listings, not content.

Change discovery so:
- **Exclude** bare listing/index URLs: a regex `INDEX_RE` matching paths whose final segment is one of `blog|insights|news|articles|resources|stories|perspectives|thinking|journal|posts|press|media|library` with nothing after (e.g. `/blog`, `/blog/`, `/insights/`). Add to filter pass.
- **Include** their children: a URL matching `BLOG_RE` qualifies as a "blog post" only if there is a slug after it (e.g. `/blog/<slug>`). Update `blogPages` filter accordingly.
- Apply the same rule to other index-style key pages where it makes sense to keep the index (about, pricing, contact) — these are legitimate content, so leave them.
- Increase `keepBlog` from 2 → up to 3 actual blog posts (still capped by `effectiveLimit`).

Also add a final sanity log: print the bucket counts (`home/key/blog/rest`) before slicing, so it's easy to diagnose future audits in the function logs.

## 3. Visually distinguish Voice / ICP / Persona / Clarity tiles

**Files:** `src/pages/BrandAudit.tsx` (Brand Health card) and `src/pages/BrandAuditDetail.tsx` (matching score blocks, if present).

Each tile gets a distinct icon + accent color tied to the dimension:

| Dimension | Icon (lucide) | Accent |
|---|---|---|
| Voice | `MessageSquareQuote` | purple `#8833ff` |
| ICP | `Target` | navy `#0f284c` |
| Persona | `Users` | orange `#e33e23` |
| Clarity | `Sparkles` | teal `#0ea5a4` |

Tile layout change:
- Icon chip in a tinted circle (`bg-{accent}/10`, icon in accent color) top-left.
- Label + weight pill ("30%", "25%", etc.) next to icon.
- Score number remains the dominant element, but its color stays driven by `scoreColor()` (red/orange/green pass/fail), not the dimension accent — so users can still read pass/fail at a glance while the icon/accent identifies which dimension.
- Add a thin top border in the accent color to reinforce identity.

Apply the same treatment to the equivalent tiles on `BrandAuditDetail.tsx` so it's consistent.

No DB or RLS changes. No new dependencies.
