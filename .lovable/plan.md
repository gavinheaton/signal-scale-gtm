

# Signal + Scale — AI-Powered GTM Platform

## Overview
A multi-tenant B2B Go-to-Market operations dashboard for Deep Tech Startups and Research Commercialisation teams. Built on React + Supabase with RLS-enforced multi-tenancy.

## Design System
- **Sidebar**: Dark navy `#0f284c`, white text/icons, purple active state `#8833ff`
- **Headings**: H1 in dark, H2/sub in orange `#e33e23`, purple accents `#8833ff`
- **Background**: `#F8F8FC`, Cards: white with shadow, 8px radius
- **Font**: Poppins throughout
- **Badges**: Pill-shaped, color-coded by type
- **Primary button**: Purple `#6B3FA0`
- **Mobile**: Sidebar collapses to bottom nav

## Phase 1: Foundation (Priority)

### Supabase Schema & RLS
Create all tables with RLS enabled:
- `organisations` (id, name, type enum)
- `org_memberships` (user_id, org_id, role enum: superadmin/owner/admin/manager/analyst/client)
- `projects` (org_id, name, status enum, methodology_progress jsonb)
- `icps` (project_id, segment_name, firmographics, psychographics, buyer_roles, anti_icp_signals, fit_score, access_score, matrix_category enum)
- `personas` (project_id, icp_id, persona_name, role_in_buying enum, goals, pain_points, channel_preferences, how_we_help, ai_readiness_score, is_current)
- `campaigns`, `campaign_assets`, `campaign_metrics`

RLS pattern: Users access rows where project → org matches their org_memberships. Security definer helper function `user_has_org_access(org_id)`.

Seed data: 1 org, 1 project, 2 ICPs (Government Agencies, Large Enterprises), 2 personas.

### Auth Flow
- Supabase Auth with magic link + email/password
- Login/signup pages, post-login redirect to project list
- Auth context with org membership awareness

### Navigation Shell
- Dark navy sidebar with icons: Home, ICP & Personas, Campaigns, Content Pipeline, Analytics, Settings
- Project selector at top of sidebar
- Collapsible sidebar with mobile bottom nav
- Active route highlighting in purple

## Phase 2: ICP & Personas Page

### ICP Tab
- **Prioritisation Matrix**: 2×2 scatter chart (Fit Score × Access Score) with quadrants: Now Accounts, Strategic Nurture, Trap Accounts, No-Go Zone. ICPs plotted as labeled dots, color-coded by category
- **ICP Segment Cards**: Grid layout showing segment_name, matrix badge, scores, firmographics summary. Clickable to expand
- **Add ICP Segment**: Right-side drawer form for all ICP fields

### Personas Tab
- **Persona Gallery**: Cards showing name, role_in_buying badge, ICP segment, AI readiness (5 dots), top 2 pain points
- **Expandable detail view** on click
- **Add Persona**: Drawer form

## Phase 3: Home / GTM Overview

- **Project List**: Post-login view of accessible projects
- **Methodology Progress Bar**: 8-phase horizontal stepper (ICP → Execution) with status badges from jsonb
- **Active Campaigns Summary**: Two cards for Demand Capture (5%) and Demand Creation (95%)
- **This Week**: Assets with publish_date in next 7 days
- **Quick Stats**: 4 cards — Total ICPs, Total Personas, Active Campaigns, Pipeline Influenced

## Phase 4: Campaigns

- **Kanban Board**: 4 columns (Brief → Complete), cards show name, track badge, target ICPs, launch date, asset count
- **95-5 Split Bar**: Horizontal ratio indicator for demand capture vs creation
- **Campaign Detail**: Objective, channel mix icons, asset pipeline sub-kanban, latest metrics
- **New Campaign form**

## Phase 5: Content Pipeline

- **Table view** of all campaign_assets across active campaigns
- Columns: Title, Asset Type, Campaign, Status, Publish Date, Persona Targets
- Filterable by status, asset_type, track
- Color-coded status badges
- Row click opens asset detail drawer

## Phase 6: Analytics

- **Brand Search Volume**: Line chart (weekly)
- **Inbound Referrals**: Bar chart by week
- **Pipeline Influenced**: Cumulative area chart
- **Share of Voice %**: Gauge/donut chart
- **Community Engagement**: Stacked bar by campaign
- Campaign selector dropdown filter
- "Measure like a brand" callout card

## Phase 7: Settings

- Org name management
- User management: invite by email, assign roles
- Project management: create/archive projects

