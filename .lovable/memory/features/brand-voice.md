---
name: Brand Voice Module
description: AI-powered brand voice wizard, detail view, and Cowork export
type: feature
---
- brand_voices table with RLS (same org access pattern)
- Edge function: brand-voice-wizard (mirrors icp-wizard pattern)
- System prompt secret: ANTHROPIC_BRAND_VOICE_SYSTEM_PROMPT (user must set separately)
- Wizard: 60/40 split layout, chat + live preview, uses wizard_sessions with type 'brand_voice'
- Detail page: read-only card grid view of completed brand voice
- Export for Cowork: client-side JSON download, filename is project slug
- Routes: /project/brand-voice, /project/brand-voice-wizard, /project/brand-voice-detail
- Sidebar: Brand Voice nav item between ICP & Personas and Campaigns (Mic icon)
- projects table now has slug column (auto-generated from name via trigger)
- Wizard auto-loads ICPs + personas from project; pre-seeds target_audiences and skips audience discovery questions
