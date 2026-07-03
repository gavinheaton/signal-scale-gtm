# Canvas variants: rename + add Business Model Canvas

## 1. Rename "Standard" → "Disruptors"

Purely a label change. Keep the underlying variant key as `standard` in the database so existing canvases keep working (no migration/backfill risk). Only the tab label in `src/pages/Canvas.tsx` changes to **Disruptors**. The 9 boxes stay identical.

## 2. Add Business Model Canvas as a third variant

New variant key: `business_model`. Nine classic Osterwalder blocks (skipping the header meta — no "Designed for / by / date / version / iteration"):

1. Key Partners
2. Key Activities
3. Key Resources
4. Value Propositions
5. Customer Relationships
6. Channels
7. Customer Segments
8. Cost Structure
9. Revenue Streams

Each block gets a short hint (e.g. Key Partners → "Who are your key partners and suppliers?").

## 3. Where to change things

- **`src/components/canvas/types.ts`**
  - Extend `CanvasVariant` to `'standard' | 'shared_value' | 'business_model'`.
  - Add `BUSINESS_MODEL_BOXES` array with the 9 blocks above.
- **`src/pages/Canvas.tsx`**
  - Tabs: `Disruptors` (value `standard`), `Shared Value` (value `shared_value`), `Business Model` (value `business_model`).
  - Extend the boxes selector to pick `BUSINESS_MODEL_BOXES` when variant is `business_model`.
  - Grid: use a 4-col layout for Business Model (top row Partners/Activities/Value Props/Relationships/Segments, etc.) — same responsive pattern already used for the other variants.
- **Database enum** (`canvas_variant`): add `'business_model'` value via a new migration so `canvases.variant` accepts it. Existing rows untouched.
- **Edge functions** (`canvas-sync`, `canvas-suggest`, `canvas-critique`, `canvas-narrative`): teach them the new box keys so AI suggestions / auto-population / narrative rendering handle Business Model blocks. Auto-mapping suggestions:
  - `customer_segments` ← ICPs (already exists)
  - `value_propositions` ← existing value_prop rows
  - `channels` ← campaigns' channel_mix
  - `key_activities` / `key_resources` / `key_partners` / `customer_relationships` ← left for AI suggestions
  - `cost_structure` / `revenue_streams` ← AI suggestions

## 4. Out of scope

- No changes to the Disruptors 9-box content or Shared Value canvas.
- No header/meta fields ("Designed for", "Date", etc.).
- No new tables — reuses `canvases` / `canvas_entries` / `canvas_validations`.

After you approve, I'll implement in build mode.
