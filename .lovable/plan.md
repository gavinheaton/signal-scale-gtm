

# Persona Sunburst Visualization (Revised)

## Key Insight

Archetypes identified from ICP conversations aren't always individual people. They can be:
- **People**: "The Visionary CTO", "The Procurement Lead"
- **Processes**: "Annual Budget Cycle", "Vendor Approval Workflow"
- **Reporting Lines**: "Board → CFO → Procurement chain"
- **Policy Positions**: "AI Governance Committee", "Data Residency Mandate"

The sunburst and the auto-identification logic must treat these as **buying influences** rather than strictly "personas as people." The outer ring labels should reflect this — showing the archetype name and a type indicator (person, process, policy, structure).

## Visualization Design

Three concentric rings inside a Card titled "Buying Influence Map":

- **Center**: ICP segment names (colored by `matrix_category`)
- **Middle ring**: Buying role categories (Champion, Economic Buyer, Influencer, End User, Blocker) — but understood as influence types, not just job titles
- **Outer ring**: Mapped archetypes — each labeled with name + a small icon/badge indicating type (person 👤, process ⚙️, policy 📋, structure 🏛️)
- **Gap segments**: Dashed outline, muted fill — roles without a mapped archetype yet

Hover tooltip shows: archetype name, type, role, parent ICP, and `how_we_help` summary.

## Data Model Consideration

The existing `personas` table stores these as records with `persona_name` and `role_in_buying`. No schema change needed — the `persona_name` field already accommodates non-person archetypes (e.g., "Vendor Approval Process"). The persona wizard's prompt update (separate task) will handle identifying these varied archetype types during conversation.

## Changes

### 1. Create `src/components/icp-wizard/PersonaSunburst.tsx`

Custom SVG sunburst component:
- Props: `icps: ICP[]`, `personas: Persona[]`
- Builds hierarchy: ICP → 5 buying roles → mapped archetypes (+ gap placeholders)
- SVG arc rendering using `d3-shape` arc generator (already available via recharts dependency) or manual arc math
- Color palette: reuse existing `roleColors` (purple/green/blue/amber/red)
- Gap arcs: dashed stroke, `hsl(var(--muted))` fill
- Center text: ICP name when hovering over that segment's children
- Responsive: scales within container

### 2. Modify `src/pages/ICPPersonas.tsx`

- Import `PersonaSunburst`
- Add a `<Card>` with title "Buying Influence Map" at the top of the Personas `TabsContent`, before the card grid
- Pass `icps` and `personas` as props

## Files
- **Create**: `src/components/icp-wizard/PersonaSunburst.tsx`
- **Modify**: `src/pages/ICPPersonas.tsx`

