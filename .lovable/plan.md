

# Add Integration Help Page

## What
A new `/project/help` page documenting the step-by-step setup process for Claude (Anthropic) and Notion integrations, accessible from the sidebar and linked from the Settings connections section.

## Pages and Components

### 1. New page: `src/pages/IntegrationHelp.tsx`

A clean documentation-style page with expandable sections for each integration:

**Claude (Anthropic) section:**
- What it powers (ICP wizard, Persona wizard, Brand Voice wizard, Campaign content generation)
- Step 1: Create an Anthropic account at console.anthropic.com
- Step 2: Generate an API key under API Keys
- Step 3: Go to Settings > Connections in Signal+Scale
- Step 4: Click Configure on Claude, paste the key
- Note about billing/credits on the Anthropic side

**Notion section:**
- What it powers (push campaign assets, create campaign briefs)
- Step 1: Go to notion.so/my-integrations, create a new integration named "Signal2Scale"
- Step 2: Copy the integration token (starts with `ntn_`)
- Step 3: Go to Settings > Connections, configure Notion with the token
- Step 4: Share target Notion pages with the integration (critical step — explain the Share > Add integration flow)
- Step 5: Set the `NOTION_CAMPAIGN_BRIEFS_PAGE_ID` secret (admin/Supabase step)
- Troubleshooting: "object_not_found" means the page isn't shared with the integration

**General troubleshooting section:**
- 502 errors → check if API key is valid and service is accessible
- Permission errors → verify org role (admin+ required to manage connections)
- Link to Settings page for quick access

### 2. Update sidebar: `src/components/AppSidebar.tsx`
- Add a "Help" nav item with `HelpCircle` icon pointing to `/project/help`

### 3. Update router: `src/App.tsx`
- Add route `<Route path="/project/help" element={<IntegrationHelp />} />`

### 4. Update Settings page: `src/pages/Settings.tsx`
- Add a small "Need help setting up?" link below the Connections card description, linking to `/project/help`

## Design
- Uses existing Card, Accordion components for collapsible sections
- Consistent with the app's existing styling (Poppins, navy/purple/orange palette)
- Step numbers use orange accent badges
- Code snippets (API key formats) in monospace with muted background

## Files changed
1. `src/pages/IntegrationHelp.tsx` — new file
2. `src/components/AppSidebar.tsx` — add Help nav item
3. `src/App.tsx` — add route
4. `src/pages/Settings.tsx` — add help link

