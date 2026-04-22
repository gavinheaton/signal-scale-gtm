

# Include Feature Image in Sent Email

## Problem

When emailing an asset, the branded HTML body skips the feature image (`feature_image_url`). Recipients see chip → title → text only, even when a hero image exists.

## Solution

Insert a **full-width hero image** between the title and the content body, right after the chip/title block. If the asset has no `feature_image_url`, the section is omitted (no broken image, no empty space).

```text
┌─ [Header: Signal + Scale] ────────┐
│  [chip: blog]                     │
│  Bold Title Here                  │
│  ┌─────────────────────────────┐  │  ← NEW
│  │   feature image (hero)      │  │  ← NEW
│  └─────────────────────────────┘  │  ← NEW
│  Markdown body content…           │
│  [Footer]                         │
└───────────────────────────────────┘
```

## Technical changes

**1. `src/lib/assetEmailHtml.ts`**
- Extend `Options` with `featureImageUrl?: string` and `featureImageAlt?: string`.
- Add a `.hero` CSS block: `padding: 16px 32px 0; img { width: 100%; height: auto; display: block; border-radius: 8px; }` — email-safe (no flexbox, inline-friendly).
- Conditionally render `<div class="hero"><img src="..." alt="..." /></div>` after the title block when `featureImageUrl` is present. Escape both URL and alt text.

**2. `src/components/campaigns/EmailAssetDialog.tsx`**
- Pass `featureImageUrl: asset.feature_image_url ?? undefined` and `featureImageAlt: asset.feature_image_alt ?? asset.title` into `markdownToEmailHtml(...)` inside the `htmlContent` `useMemo`.
- No UI change to the dialog — the iframe preview will automatically show the image.

## Files

**Modified**
- `src/lib/assetEmailHtml.ts` — hero image block + new options
- `src/components/campaigns/EmailAssetDialog.tsx` — forward image fields to helper

## Notes

- No edge function, schema, or dependency changes.
- Image is referenced by URL (already publicly served from the `asset-images` Supabase bucket), so it loads in any email client without inlining/attachment.
- Alt text falls back to the asset title for accessibility if `feature_image_alt` is empty.

