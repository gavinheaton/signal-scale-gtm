

# Fix Help Page to Match Settings Reality

## Problem
The help page describes setup steps for Claude and Notion that don't precisely match what users see in the Settings page. Key mismatches:
- The Connections section only appears for **admin+** users who have a **project selected** — the help page doesn't mention this.
- Step 3 for Claude says "Open Settings → Connections" but the actual card heading is just "Connections" under Settings.
- Step 4 says "Configure Claude" which matches the button text — this is fine.

## Changes

### `src/pages/IntegrationHelp.tsx`

1. **Claude section — Step 3** (line 79-85): Add a note that the Connections section is only visible to admin+ roles and requires a project to be selected first. Update wording to: "In Signal + Scale, select a project, then go to Settings. The **Connections** section appears for admin users and above."

2. **Notion section — Step 3** (line 149-155): Same update — mention admin role requirement and project selection.

3. **Troubleshooting — Permission errors** (line 287-291): Already covers this. No change needed.

4. **Add a callout** at the top of the page (after the intro paragraph) noting: "You must have an **admin** or higher role and a project selected to see the Connections section in Settings."

## Files changed
1. `src/pages/IntegrationHelp.tsx` — update Claude step 3, Notion step 3, add role/project callout

