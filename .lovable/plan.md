

# Choose Feature Image Aspect Ratio (16:9 or Square)

## What you'll get

A small **aspect-ratio toggle** in the Feature Image panel of the asset drawer, letting you pick **16:9** (default, hero/blog) or **1:1 Square** (LinkedIn/social) before generating variants.

```text
┌─ Feature Image ────────────────────────────┐
│  Aspect:  ( ● 16:9 )  ( ○ Square 1:1 )    │
│  [ Edit prompt ]                           │
│  [ Generate 4 variants ]                   │
│  ── variants grid ─────────────────────    │
└────────────────────────────────────────────┘
```

- The chosen ratio drives **both** generation and the title-overlay composite, so the final feature image keeps the chosen shape.
- Default 16:9 (current behaviour) — no surprises for existing flows.
- Selection is per-generation (component state), not persisted on the asset. If a user wants square, they tick it then click Generate.

## Technical changes

**1. `src/components/campaigns/AssetVisualsPanel.tsx`**
- Add `aspect` state: `'16:9' | '1:1'`, default `'16:9'`.
- Add a small `RadioGroup` (or two-button toggle) above the Generate button.
- Pass `aspect` in the `generate-asset-image` invoke body.
- When clicking a variant to apply title overlay, pass the same `aspect` to `composite-feature-image` (read from the variant's stored aspect — see below).
- Variant thumbnails: switch `h-32 object-cover` to `aspect-video` for 16:9 and `aspect-square` for square so previews match the real shape.

**2. `supabase/functions/generate-asset-image/index.ts`**
- Accept `aspect: '16:9' | '1:1'` in `ReqBody` (default `'16:9'`).
- Inject the matching phrase into the prompt: `"16:9 horizontal composition"` or `"1:1 square composition, centered subject"`.
- Persist `aspect` on each `asset_images` row so the composite step knows the shape later.

**3. `supabase/functions/composite-feature-image/index.ts`**
- Read the source variant's `aspect` (fallback `'16:9'`).
- Append the matching phrase to the edit prompt and instruct the model to **preserve the original aspect ratio** so the title-overlaid version stays the same shape.

**4. Database migration**
- Add `aspect text not null default '16:9'` (with check constraint `in ('16:9','1:1')`) to `asset_images`. No backfill needed — default covers existing rows.
- No change to `campaign_assets` (the `feature_image_url` is just a URL; clients render it responsively).

**5. `src/types/database.ts`**
- Add `aspect: '16:9' | '1:1'` to the `AssetImage` type.

## Notes

- The Lovable AI image gateway respects compositional cues in prompts; we already use the same mechanism for "16:9 horizontal composition", so adding `"1:1 square composition"` is the consistent way to control shape.
- The email template (`assetEmailHtml.ts`) already uses `width: 100%; height: auto;` so square images render correctly with no template changes needed.
- No changes to publishing or Notion push — both consume `feature_image_url` directly.

## Files

**Modified**
- `src/components/campaigns/AssetVisualsPanel.tsx` — aspect toggle, pass to both edge functions, responsive previews
- `supabase/functions/generate-asset-image/index.ts` — accept aspect, adjust prompt, persist on row
- `supabase/functions/composite-feature-image/index.ts` — read aspect, preserve shape in overlay
- `src/types/database.ts` — `AssetImage.aspect`

**New**
- Supabase migration: add `aspect` column to `asset_images`

