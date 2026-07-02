## Discovery: enrichment + Organisations UX overhaul

### 1. Enrichment finds & validates URLs

**Edge function `discovery-enrich-org`:**
- Add a URL-discovery step before AI extraction:
  - If `org.domain` is set, HTTP-check via Firecrawl scrape of `https://<domain>`. Compare returned page title/H1 against `org.name` (loose match) — if mismatch, mark `website_verified=false` and add a note.
  - If missing/invalid, run Firecrawl search `"<org name>" official site` and pick the top non-social result; write back to `org.domain`.
  - Firecrawl search `"<org name>" site:linkedin.com/company` → save first hit as `linkedin_url`.
  - For each leader extracted, Firecrawl search `"<leader name>" "<org name>" site:linkedin.com/in` → attach `linkedin_url` per leader.
- Extend AI JSON schema (already flexible) with `website_verified: boolean`, `linkedin_url: string|null`, and `leadership[].linkedin_url`.

**Schema (migration):**
- `discovery_organizations`: add `linkedin_url text`, `website_verified boolean default false`.
- No new table needed — leader LinkedIn URLs already fit inside the existing `leadership jsonb`.

### 2. Auto-create Contacts + org_roles from enrichment leaders

At the end of `discovery-enrich-org`, for each `leadership[]` entry with a `name`:
- Upsert a `discovery_org_roles` row (`role_title = leader.role || 'Leadership'`, `status='identified'`, `source_url = enrichment source`).
- Upsert a `discovery_contacts` row (dedup by lowercased name within the org):
  - `name`, `title = leader.role`, `linkedin_url = leader.linkedin_url`, `enrichment_source='manual'` (repurposed to mean "not Apollo"; add `'firecrawl'` to enum for clarity).
  - `org_role_id` linked to the role just created, `persona_id=null` (user assigns later).
- Existing "Enrich with Apollo" flow on that role then fills email + refined LinkedIn.

**Migration:** add `'firecrawl'` value to `discovery_enrichment_source` enum.

### 3. Expanded Contacts card

In `ContactsTab.tsx`, expand each contact row to show enrichment data:
- Header row: name, title, persona badge, source badge (`firecrawl` / `apollo` / `manual`), outreach status.
- Expand toggle reveals: LinkedIn button, email, seniority (if from Apollo), linked role title + source URL (where the leader was found), any notes.
- Add a "source" column with a small icon (Sparkles=firecrawl, Building2=apollo, Pencil=manual).

### 4. Organisations tab: cleaner table with expandable rows

Rewrite `OrganizationsTab.tsx` table:
- **Collapsed row (6 columns):** chevron | Name (+enriched dot) | Domain | Tier | Status | Contacts count | actions (…menu with Enrich / Edit / Roles / Delete).
  - Drop Signals, Leaders, Roles columns from the collapsed view.
- **Expanded row** (below, full-width): 3-column grid — Leaders list w/ LinkedIn links · Matched signals + fit notes · Enrichment metadata (confidence, verified website, LinkedIn URL, last enriched at).
- Actions collapse into a dropdown menu to reduce visual noise.
- Add a **status filter** pill row above the table (All / Researching / Targeted / In conversation / Validated / Disqualified) with counts.

### 5. Status auto-advance

Non-destructive nudges only (never move backwards, never overwrite `validated`/`disqualified`):
- On first contact added to an org whose status is `researching` → set to `targeted`.
- On first conversation logged for any contact of an org whose status is `researching` or `targeted` → set to `in_conversation`.
- Implement in frontend right after the successful insert (simpler than triggers, matches existing patterns) with a single helper `maybeAdvanceOrgStatus(orgId, target)`.

### Technical notes
- Files touched: `supabase/functions/discovery-enrich-org/index.ts`, `src/components/discovery/OrganizationsTab.tsx`, `src/components/discovery/ContactsTab.tsx`, `src/types/discovery.ts`, one migration.
- Migration adds two columns + one enum value; existing rows unaffected (defaults handle it).
- Existing Apollo flow untouched — it still enriches roles created either by "Find roles" or by auto-creation here.
- No changes to Conversations/Insights tabs.

### Out of scope
- Ecosystem/discovery-find-roles changes.
- Building a real "match confidence" score for the website check (loose string match only).
- Any per-user OAuth for LinkedIn scraping (we rely on public Firecrawl scraping only).
