

# Always Set Publish Date on Notion Calendar Entries

## Problem
When content items are pushed to Notion without a `Publish Date`, they don't appear on the calendar view — they effectively disappear. The three edge functions only set `Publish Date` conditionally (when the item has a date), leaving entries without dates invisible in the calendar.

## Solution
In all three functions, default `Publish Date` to today's date (`new Date().toISOString().split("T")[0]`) when no date is provided. This anchors every entry on the calendar.

## Changes

### 1. `supabase/functions/create-notion-campaign-brief/index.ts`

**Brief entry (line ~148-158)**: Add `"Publish Date": { date: { start: today } }` to the brief properties.

**Calendar items (lines 191-194)**: Change from conditional to always-set:
```typescript
const today = new Date().toISOString().split("T")[0];
properties["Publish Date"] = { date: { start: item.publish_date || item.week || today } };
```

### 2. `supabase/functions/push-asset-to-notion/index.ts`

**Line ~169-170**: Change from `if (asset.publish_date)` to always set:
```typescript
const today = new Date().toISOString().split("T")[0];
properties["Publish Date"] = { date: { start: asset.publish_date || today } };
```

### 3. `supabase/functions/bulk-push-campaign-to-notion/index.ts`

**Line ~172**: Same pattern — always set Publish Date, defaulting to today:
```typescript
const today = new Date().toISOString().split("T")[0];
properties["Publish Date"] = { date: { start: asset.publish_date || today } };
```

## Files changed
1. `supabase/functions/create-notion-campaign-brief/index.ts` — default date on brief + calendar items
2. `supabase/functions/push-asset-to-notion/index.ts` — default date on asset push
3. `supabase/functions/bulk-push-campaign-to-notion/index.ts` — default date on bulk push

