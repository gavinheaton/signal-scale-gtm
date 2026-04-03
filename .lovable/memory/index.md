# Project Memory

## Core
Signal + Scale: B2B GTM platform for deep tech startups. Poppins font.
Sidebar: #0f284c navy. Purple accent #8833ff. Orange sub-headings #e33e23. Bg #F8F8FC.
External Supabase: xiufgczyecwgnkbyroow. No Lovable Cloud.
Multi-tenant via org_memberships table with RLS security definer functions.
Roles: superadmin (platform-wide), owner, admin, manager, analyst, client. is_superadmin() RLS function.

## Memories
- [Design tokens](mem://design/tokens) — Full color palette, sidebar, cards, badges
- [Database schema](mem://features/schema) — All tables, enums, RLS pattern
- [Auth flow](mem://features/auth) — Magic link + email/password, org membership context
- [Admin hierarchy](mem://features/admin) — Super admin dashboard, invite-user edge function, role gating
