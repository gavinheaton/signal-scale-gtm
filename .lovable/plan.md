## Goal
Make org records on `/project/discovery/:id` editable, and add an AI-powered enrichment button that fetches profile info via web search.

## 1. Edit organisation records
In `src/components/discovery/OrganizationsTab.tsx`:
- Add an **Edit** action to each org row (pencil icon alongside the existing Roles/Delete actions).
- Reuse a `Sheet` drawer (same style as the Add flow) with fields:
  - Name, Domain, Segment, Tier (select from campaign tiers), Status (select), Confidence (high/medium/low), Signals matched (chips against `campaign.qualifying_signals`), Source URL, Fit notes (textarea), Leadership (editable list of {name, role}).
- Save via `supabase.from('discovery_organizations').update(...).eq('id', org.id)` then refresh.
- Allow inline quick-edit of **Status** directly in the table (keep current cell display but make it a Select) for fast triage.

## 2. Enrichment button
- New edge function `supabase/functions/discovery-enrich-org/index.ts`:
  1. Loads the org + parent campaign (for context: ICPs, qualifying signals, segment).
  2. Uses **Firecrawl search + scrape** on the org's domain / name to pull homepage, about, leadership pages.
  3. Sends scraped snippets to **Lovable AI Gateway** (`google/gemini-3-flash-preview`) with structured output to return:
     ```
     { description, industry, hq_location, employee_range, founded_year,
       tech_focus[], leadership[{name,role,source_url}],
       matched_signals[], fit_rationale, confidence }
     ```
  4. Merges result into the org row: updates `fit_notes` (prepends AI summary), `leadership` (dedup merge), `signals_matched` (union), `confidence`, and stores the full enrichment payload in a new `enrichment` jsonb column.
- Migration: `ALTER TABLE discovery_organizations ADD COLUMN enrichment jsonb, ADD COLUMN enriched_at timestamptz;` (plus type export).
- UI: **Enrich** button (Sparkles icon) per row + bulk "Enrich selected" in the table header. Shows spinner while running; toast on success/failure. Enriched orgs show a small "Enriched {relative time}" badge and an expandable panel with the AI-returned profile fields.

## 3. Detail view
When clicking an org name, open a read-only Sheet showing the merged profile (description, HQ, size, leadership with source links, matched signals, fit rationale) with Edit and Re-enrich buttons in the footer.

## Files touched
- `src/components/discovery/OrganizationsTab.tsx` — edit dialog, enrich buttons, detail sheet.
- `src/types/discovery.ts` — add `enrichment`, `enriched_at` to `DiscoveryOrganization`.
- `supabase/functions/discovery-enrich-org/index.ts` — new.
- Migration adding `enrichment jsonb`, `enriched_at timestamptz` on `discovery_organizations`.

No changes to other discovery tabs or ecosystem sync.