

# Auto-extract Generated Title + Inline Title Edit

## Problem

When AI generates content (e.g. blog post), it writes a strong headline at the top of the markdown — but the asset's `title` field stays as the original placeholder (e.g. "Blog Post — Week 3"). Users have no quick way to fix this from the drawer; the existing edit button bundles title + body together.

## Solution

### 1. Auto-extract title server-side after generation

In `supabase/functions/generate-campaign-content/index.ts`, after the AI returns content:

- Parse the first markdown heading (`# Title` or `## Title`) from the generated content.
- If found AND the existing asset title looks generic (matches patterns like `Blog Post`, `Email N`, `Untitled`, or equals the asset_type label), update `title` alongside `content`.
- Strip that heading from the body before saving so it isn't rendered twice (the title is already shown in the drawer header).
- Fallback: if no heading found, leave the existing title untouched.

This means freshly generated assets land with a real headline without any user action. Existing custom titles are preserved.

### 2. Inline title edit in `AssetDetailDrawer.tsx`

Add a small **pencil button next to the title** in the sheet header, independent of the existing content editor:

```text
┌─ [Asset Title]  ✎  ─────────── ✕ ─┐
│  badge: blog · badge: draft       │
```

Behaviour:
- Click pencil → title becomes an `<Input>` inline with **Save** (check icon) and **Cancel** (X) buttons.
- Enter key saves, Esc cancels.
- Save calls `supabase.from('campaign_assets').update({ title }).eq('id', asset.id)`, toasts success, calls `onUpdated()`.
- Independent from the existing body-edit flow (which still edits both title + content together — left as-is for power editing).

### 3. Files

- `supabase/functions/generate-campaign-content/index.ts` — extract & strip first heading, update title when generic.
- `src/components/campaigns/AssetDetailDrawer.tsx` — pencil button + inline title editor in `SheetHeader`.

No schema or routing changes.

