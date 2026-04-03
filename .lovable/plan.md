

# Integrate Claude AI into Signal 2 Scale

You already have `ANTHROPIC_API_KEY` configured in Supabase secrets, so we can start building immediately.

## Architecture

```text
Frontend (React)                Edge Function              Anthropic API
┌──────────────┐    POST       ┌──────────────┐  stream   ┌───────────┐
│ AI Chat Panel │───────────►  │ ai-chat/     │─────────► │ Claude    │
│ AI buttons    │◄─────────    │ index.ts     │◄───────── │ 3.5 Sonnet│
└──────────────┘    SSE        └──────────────┘           └───────────┘
```

## What gets built

### 1. Edge function: `supabase/functions/ai-chat/index.ts`
- Accepts messages + a `mode` parameter (`chat`, `generate_content`, `analyze_icp`, `strategy`)
- Uses `ANTHROPIC_API_KEY` to call Claude 3.5 Sonnet directly
- System prompts tailored per mode (GTM strategist for chat, copywriter for content, analyst for ICP)
- Streams responses back via SSE
- Validates JWT to ensure only authenticated users can call it

### 2. AI Chat sidebar: `src/components/AIChatPanel.tsx`
- Slide-out panel triggered by a floating button or sidebar icon
- Markdown-rendered responses (react-markdown)
- Context-aware: automatically includes current project name and data summary
- Streaming token-by-token display

### 3. AI action buttons on existing pages
- **ICP & Personas page**: "Analyze with AI" button that sends ICP data to Claude for insights
- **Campaigns page**: "Generate Brief" button for AI-assisted campaign briefs
- **Content Pipeline page**: "Draft Content" button for generating asset copy
- Each uses the same edge function with a different `mode`

### 4. Navigation update
- Add a sparkle/bot icon to the sidebar for the AI chat
- Or: floating action button in bottom-right corner

### 5. Config update
- Add `ai-chat` function to `supabase/config.toml`

## Files to create/update
- **New**: `supabase/functions/ai-chat/index.ts` — Claude edge function
- **New**: `src/components/AIChatPanel.tsx` — chat UI component
- **New**: `src/hooks/useAIChat.ts` — streaming hook
- **Update**: `src/components/AppSidebar.tsx` — add AI chat nav item
- **Update**: `src/pages/ICPPersonas.tsx` — add AI analyze button
- **Update**: `src/pages/Campaigns.tsx` — add generate brief button
- **Update**: `src/pages/ContentPipeline.tsx` — add draft content button
- **Update**: `supabase/config.toml` — register new function

## No database changes needed
Chat history is kept in React state for now. We can add persistence later if desired.

## Implementation order
1. Edge function with streaming
2. Chat hook + panel component
3. Wire into sidebar
4. Add contextual AI buttons to ICP, Campaigns, and Content pages

