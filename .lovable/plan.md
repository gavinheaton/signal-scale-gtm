
# Ecosystem Map (Phase 5)

Grounded in the DH19 handbook. Same 5-step concentric model: **You → User Segments → Companies → Buyer Roles → Named People**, with a stakeholder-readiness rubric layered on top. Delivered as a hybrid canvas: auto-seeded from existing data, then curated manually.

## Handbook → app mapping

| Handbook layer | Signal2Scale source |
|---|---|
| 1. You (team & product) | Project (fixed centre node) |
| 2. User Segments | `icps` (segment_name, matrix_category) |
| 3. Companies in each segment | `discovery_organizations` |
| 4. Buyer roles | `personas` + `discovery_org_roles` |
| 5. Named people | `discovery_contacts` (+ `leadership` from orgs) |
| Rubric | Composite score: ICP fit/access + persona AI-readiness + contact enrichment/outreach status |
| Adjacent actors | New manual node types: Partner, Regulator, Competitor, Channel, Influencer, Community |
| Themes/Insights overlay | `discovery_themes`, `discovery_insights` as attached "evidence" nodes |

## Canvas

- **Layout**: concentric hexagonal rings by default (You centre → Segments ring → Companies ring → Roles/People ring), matching the handbook diagrams. Users can switch to free-form once they start dragging.
- **Node types** (colour + icon): Project, Segment (ICP), Company, Role (Persona), Person (Contact), Partner, Regulator, Competitor, Channel, Influencer, Community, Theme, Insight.
- **Edge types**: `serves`, `buys_from`, `partners_with`, `regulates`, `competes_with`, `influences`, `belongs_to`, `evidences`, `custom`.
- **Interactions**: pan/zoom, mini-map, click node → right-hand drawer with the underlying record and deep-links back into ICP/Persona/Discovery pages; drag to re-position (persisted); "Add manual node/edge" toolbar; hide-noise toggle; cluster/group by segment or campaign; filter chips by node kind, readiness score, and discovery campaign.
- **Readiness overlay**: node border colour driven by rubric score (cold/warm/hot), matching handbook's Page 20 rubric concept.

## Placement

- New sidebar item **Ecosystem** → `/project/ecosystem` (Phase 5 marker in methodology stepper turns to "in_progress" on first visit, "complete" once ≥1 segment + ≥5 companies + ≥1 person exist).
- Mini-map preview embedded on `/project/home` and on each Discovery campaign dashboard.

## Data model (new)

```text
ecosystem_maps
  id, project_id, name, layout_mode ('concentric'|'freeform'),
  viewport jsonb (zoom, pan), created_at, updated_at

ecosystem_nodes
  id, map_id, project_id,
  kind (enum: project|segment|company|role|person|partner|regulator|
        competitor|channel|influencer|community|theme|insight|custom),
  ref_table text NULL, ref_id uuid NULL,       -- link to source record
  label text, subtitle text,
  x float, y float, ring int NULL, cluster text NULL,
  readiness_score int NULL,                    -- 0..100 rubric
  hidden bool default false,
  meta jsonb, created_at, updated_at

ecosystem_edges
  id, map_id, project_id,
  source_node_id, target_node_id,
  kind (enum above), weight int, note text,
  meta jsonb, created_at, updated_at
```

RLS: standard `project_id IN (…org_memberships…)` pattern. GRANTs to `authenticated` + `service_role`.

## Sync-from-data engine

Edge function `ecosystem-sync` (idempotent, project-scoped):

1. Ensure a `project` node exists at ring 0.
2. Upsert one `segment` node per ICP → edge `segment -serves→ project`.
3. Upsert one `company` node per `discovery_organization` linked to its campaign's target ICPs → edge `company -belongs_to→ segment`.
4. Upsert one `role` node per `persona` (attached to its ICP) and per `discovery_org_role` (attached to its org).
5. Upsert one `person` node per `discovery_contact` and per entry in `organizations.leadership` → edge `person -belongs_to→ role/company`.
6. Compute `readiness_score` (weighted blend of ICP fit/access, persona ai_readiness_score, contact enrichment completeness, outreach status).
7. Never delete manually-added nodes/edges; synced nodes that disappear from source get `hidden=true` with a "stale" flag, user can restore or purge.

Manual edits (add node, add edge, drag, hide, rename) are stored on the same tables with `ref_table=null`.

## UI surface

- `src/pages/Ecosystem.tsx` — map picker + canvas host.
- `src/components/ecosystem/EcosystemCanvas.tsx` — React Flow canvas (add dep `reactflow`) with custom node components per kind, concentric auto-layout helper, mini-map, controls.
- `src/components/ecosystem/NodeDrawer.tsx` — details + deep links.
- `src/components/ecosystem/AddNodeToolbar.tsx` — manual add node/edge; segment/company/role/person pickers pull from existing tables.
- `src/components/ecosystem/SyncButton.tsx` — triggers `ecosystem-sync` with progress + diff summary.
- `src/components/ecosystem/EcosystemMiniMap.tsx` — read-only preview for Home + Discovery dashboards.
- Sidebar link added to `AppSidebar.tsx`; methodology stepper updated to link Phase 5 to `/project/ecosystem`.

## Rubric (matches handbook Page 20)

Configurable weights stored on `ecosystem_maps.meta`. Default:
- ICP fit_score × 0.25
- ICP access_score × 0.15
- Persona ai_readiness_score × 0.20
- Contact enriched (has email/phone) × 0.20
- Outreach status (replied > contacted > queued > none) × 0.20

Score drives node border colour and appears in the drawer with the rubric breakdown so users can see *why* a node is hot.

## Out of scope for v1

- Real-time collaborative editing.
- Auto edge inference between competitors/partners (manual only in v1).
- Export to PNG/PDF (fast follow).

## Delivery order

1. Migration: `ecosystem_maps`, `ecosystem_nodes`, `ecosystem_edges` + GRANTs + RLS.
2. `ecosystem-sync` edge function + shared score helper.
3. `reactflow` install + `EcosystemCanvas` with concentric auto-layout.
4. Sync button, drawer, manual add toolbar, filters.
5. Sidebar/stepper wiring + Home + Discovery mini-map previews.
