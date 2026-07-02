# Fix Discovery organisation search: filter directories/providers + auto-save

Two changes to make "Find organisations" reliably surface real buyers and stop losing results.

## 1. Exclude directories, aggregators, and service providers (edge function)

Edit `supabase/functions/discovery-find-orgs/index.ts`:

**a. Expand hard-block host list** to cover directory/aggregator sites we currently treat as valid "direct candidates":
- Directories: `crunchbase.com`, `owler.com`, `pitchbook.com`, `g2.com`, `capterra.com`, `builtin.com`, `glassdoor.com`, `trustpilot.com`, `clutch.co`, `getapp.com`, `softwareadvice.com`, `producthunt.com`, `angel.co`, `wellfound.com`, `wikipedia.org`, `zoominfo.com`, `apollo.io`, `rocketreach.co`, `similarweb.com`
- Job boards / listings: `indeed.com`, `seek.com.au`, `glassdoor.com`, `ziprecruiter.com`
- News wires: `businesswire.com`, `prnewswire.com`, `globenewswire.com`

These stay usable as *article sources* for stage-2 extraction (scraped for company names), but never enter the candidate list as themselves. Move them from `ARTICLE_HOSTS` handling so their own URL is never treated as a company.

**b. Add a "buyer, not provider" constraint** to both AI prompts (stage-2 extraction and stage-3 scoring):
- Extraction prompt: add explicit rule — "Only return organisations that would BUY/USE the service described by target_segment + qualifying_signals. Exclude vendors, agencies, consultancies, SaaS tools, marketplaces, directories, media outlets, and industry bodies unless the target_segment explicitly names them as buyers."
- Scoring prompt: same rule, plus require dropping candidates whose domain/name suggests they *sell* the category (e.g. "…platform", "…software", "…agency", "…consulting") when the campaign targets buyers of that category.
- Pass the campaign's `target_segment` verbatim as the buyer definition so the model has the reference.

**c. Tighten direct-candidate acceptance**: for hits that aren't LinkedIn company pages, only keep them as "direct" if the URL path is the site root (`/`, `/about`, `/company`) — deeper paths on unknown hosts usually indicate article/list pages and should route to stage-2 scraping instead of being trusted as an org.

## 2. Auto-save returned candidates (frontend)

Edit `src/components/discovery/OrganizationsTab.tsx` `SearchPanel`:

- After `run()` returns candidates, immediately insert them into `discovery_organizations` (same shape as current `save()` builds), then call `onAdded()` to refresh the parent table.
- Remove the manual "Add N organisations" button and checkbox selection flow. Replace with a read-only preview list showing what was just saved, plus a "Remove" (trash) button per row that deletes from the DB.
- Keep the diagnostics panel unchanged.
- Because rows land in `discovery_organizations` immediately, the parent table always reflects the latest search — nothing is lost if the user closes the panel or navigates away.
- Deduplicate on insert by `(campaign_id, lower(domain))` client-side against currently loaded `orgs` to avoid duplicate rows on re-runs.

## Out of scope

- No schema changes.
- No changes to role/contact discovery.
- No changes to campaign form or ICP prompts.
