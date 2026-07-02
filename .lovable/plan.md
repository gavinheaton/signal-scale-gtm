Merge firecrawl-identified roles into the Contacts tab table instead of showing them in a separate amber banner.

## Current problem
`discovery_org_roles` with status `identified` (just job titles found by firecrawl) are rendered in a disconnected amber banner above the actual `discovery_contacts` table. The user has to look in two places to see every person/role at a company.

## Proposed change
Render both contacts and unenriched roles in the **same table** per organisation, with visual distinction between "real contact" and "role identified by AI — needs enrichment".

### UI changes

#### ContactsTab.tsx
1. **Remove the amber banner block** (lines 110-124) entirely.
2. **Build a unified list** per organisation: combine `org.discovery_contacts` and `org.discovery_org_roles.filter(r => r.status === 'identified')` into one array, sorted by role title then name.
3. **Render each item as a table row** in the existing bordered list (lines 126-198).
   - **If it's a real contact** (`discovery_contact`): render exactly as now (name, source badge, title, email/LinkedIn icons, outreach status dropdown, expandable details).
   - **If it's an unenriched role** (`discovery_org_role`): render a row that shows:
     - Role title (e.g. "CEO") as the primary label
     - A subtle "Role identified" badge (e.g. dashed outline, muted text)
     - Persona badge if assigned
     - "Enrich" button inline (replaces the outreach status dropdown)
     - No expand chevron (nothing to expand yet)
     - Muted/ghost styling so it visually recedes compared to enriched contacts
4. **Inline enrichment flow**: clicking "Enrich" on a role row opens the same `EnrichApolloSheet` (already exists). On save, the role becomes a contact and refreshes into the table.

#### No backend changes
The enrichment logic (`discovery-enrich-apollo` edge function, `discovery_org_roles` ↔ `discovery_contacts` relationship via `org_role_id`) already works. This is a pure UI reorganisation.

### Visual design notes
- Use the project's existing muted/ghost styling (muted-foreground, border-dashed, bg-muted/20) for pending role rows.
- Do not introduce new hardcoded colors.
- Keep the "Add manually" button on the org card header.