

# Widen Asset Detail Drawer + Add Edit Mode

## Problem
The asset detail drawer (`SheetContent`) is capped at `sm:max-w-lg` (~32rem), which is too narrow for comfortable content editing. There is no way to edit the content inline — it's read-only markdown.

## Solution

### 1. Widen the drawer
In `src/components/campaigns/AssetDetailDrawer.tsx`, change the `SheetContent` className from `sm:max-w-lg` to `sm:max-w-2xl` (~42rem), giving substantially more room for content display and editing.

### 2. Add inline edit mode
Add an `editing` state toggle. When not editing, content shows as rendered markdown (current behavior) with an "Edit" button. When editing, content switches to a full-height `Textarea` with "Save" and "Cancel" buttons.

**State additions:**
- `editing: boolean` — toggles between view/edit
- `editContent: string` — holds the editable text
- `saving: boolean` — for save spinner

**UI changes:**
- Add a `Pencil` icon button next to the "Content" label that sets `editing = true` and populates `editContent` from `asset.content`
- In edit mode: render a `Textarea` (rows=16, full width) instead of the markdown preview
- Save button writes `content` back to `campaign_assets` via Supabase update, auto-advances status from `brief` to `draft` if content was empty
- Cancel button reverts to view mode without saving
- Also allow editing the asset `title` — show an `Input` field in edit mode instead of the static title

### Visual layout (edit mode)

```text
┌─────────────────────────────────────┐
│  [Title input field]          [X]   │
│  blog post · draft                  │
├─────────────────────────────────────┤
│  Status: [dropdown]                 │
│                                     │
│  Content                    [Save]  │
│  ┌─────────────────────────────┐    │
│  │ editable textarea           │    │
│  │ with full markdown content  │    │
│  │ ...                         │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│  [Cancel]                           │
│                                     │
│  Custom prompt (optional)           │
│  [textarea]                         │
│                                     │
│  [Generate] [Push to Notion]        │
└─────────────────────────────────────┘
```

## Files changed
1. **`src/components/campaigns/AssetDetailDrawer.tsx`** — widen to `max-w-2xl`, add edit/save mode for content and title

