

# Fix: Notion Push 502 — Page ID is a URL, not a UUID

## Root Cause

The edge function logs show the exact error from Notion's API:

> `body.parent.page_id should be a valid uuid, instead was "https://www.notion.so/DC-Campaign-Briefs-3378e087684e8..."`

The `NOTION_CAMPAIGN_BRIEFS_PAGE_ID` secret contains a full Notion URL instead of a raw UUID. The Notion API requires a plain UUID for `parent.page_id`.

## Fix

**File: `supabase/functions/push-asset-to-notion/index.ts`**

Add a helper that extracts a UUID from either a raw UUID string or a Notion URL, then apply it to both `NOTION_PARENT_PAGE_ID` and the `parent_page_id` request parameter.

```typescript
function extractNotionId(input: string): string {
  // If it's already a UUID, return as-is
  if (/^[0-9a-f]{8}-/.test(input)) return input;
  // Extract 32-char hex from URL and format as UUID
  const match = input.match(/([0-9a-f]{32})/);
  if (match) {
    const h = match[1];
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  return input; // fallback
}
```

Then use `extractNotionId(parent_page_id || NOTION_PARENT_PAGE_ID)` when building the Notion API request body.

**Also update: `supabase/functions/bulk-push-campaign-to-notion/index.ts`** — apply the same fix there since it also uses `NOTION_CAMPAIGN_BRIEFS_PAGE_ID`.

No database or UI changes needed. Two edge function files updated.

