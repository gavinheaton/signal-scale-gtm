

# Import Healthcare AI Campaign into Disruptors Co Project

## What We're Building

Reverse-engineering the 90-Day Healthcare AI Marketing Sprint into the existing Disruptors Co project as structured data: one ICP, one persona, one parent campaign with all content assets, and initial KPI targets.

## Data to Insert

### 1. ICP: Healthcare Innovation Leaders
Insert into `icps` table for project `161cfc9d-4e01-4994-8407-f7cf7aa1bcf4`:

| Field | Value |
|-------|-------|
| segment_name | Healthcare Innovation Leaders — AU |
| matrix_category | now_account |
| fit_score | 85 |
| access_score | 70 |
| firmographics | Org types (private hospital groups, health insurers, aged care, pharma, health tech), 500-10K employees, Sydney/Melbourne/Brisbane, deal size $30K-$250K+ |
| psychographics | AI governance pressure, board mandates, peer-referral driven, LinkedIn-first discovery |
| buyer_roles | Head of Innovation, CTO, CDO, Chief Transformation Officer, Director of Digital Health |
| anti_icp_signals | Sub-500 employees, no innovation mandate, no digital health budget |

### 2. Persona: The Healthcare Innovation Champion
Insert into `personas` table linked to the new ICP:

| Field | Value |
|-------|-------|
| persona_name | The Healthcare Innovation Champion |
| role_in_buying | champion |
| goals | Demonstrate AI productivity gains to C-suite, build internal AI capability, run innovation programs with commercial/clinical outcomes |
| pain_points | Managing AI governance/ethics/compliance risk, finding partners who speak healthcare + tech, stalled internal initiatives |
| channel_preferences | LinkedIn (primary), peer referral, conferences, webinars, white papers |
| how_we_help | Bridge AI ambition to implementation with sector credibility, safe innovation, and proven methodology from J&J, AstraZeneca, CSIRO ON Prime |
| buying_behaviour | Low trust in cold outreach, 2-4 touchpoints before commercial conversation, procurement above $50K |
| ai_readiness_score | 3 |

### 3. Campaign: Healthcare AI 90-Day Sprint
Insert into `campaigns` table:

| Field | Value |
|-------|-------|
| name | Healthcare AI 90-Day Sprint |
| track | demand_creation |
| status | active |
| objective | Generate 10-15 qualified discovery conversations and 1-2 closed engagements within 90 days, establishing a beachhead in the Australian healthcare AI consulting market |
| launch_date | 2026-03-19 |
| end_date | 2026-06-17 |
| target_icp_ids | [new ICP id] |
| channel_mix | LinkedIn (60%), Email (20%), Content (15%), Partnerships (5%) |

### 4. Campaign Assets (13 items)
Insert into `campaign_assets` table, mapped from the plan + nurture docs:

| Title | Type | Status | Publish Date |
|-------|------|--------|-------------|
| Healthcare AI Readiness Report 2026 | whitepaper | published | 2026-03-19 |
| Healthcare AI Value Proposition One-Pager | whitepaper | published | 2026-04-01 |
| AI Workshop Discovery One-Pager | whitepaper | published | 2026-04-01 |
| Nurture Email 1: Welcome + Report Delivery | email | published | 2026-03-19 |
| Nurture Email 2: Clinical Decision Support | email | published | 2026-03-23 |
| Nurture Email 3: Admin Automation | email | published | 2026-03-27 |
| Nurture Email 4: Governance & Ethics | email | approved | 2026-04-02 |
| Nurture Email 5: Self-Assessment Framework | email | approved | 2026-04-09 |
| Nurture Email 6: Strategy Session CTA | email | approved | 2026-04-16 |
| AI Transformation in Healthcare Webinar | webinar | brief | 2026-05-02 |
| Healthcare AI Press Release | blog | published | 2026-03-17 |
| LinkedIn Personal Brand Series (Month 1) | linkedin_post | draft | 2026-03-19 |
| Healthcare Case Study | blog | brief | 2026-05-18 |

### 5. Campaign Metrics (baseline targets)
Insert Month 1 baseline metrics into `campaign_metrics`:

| Date | Brand Search Vol | Inbound Referrals | Pipeline Influenced | Share of Voice | Community Engagement |
|------|-----------------|-------------------|--------------------|-----------------|--------------------|
| 2026-03-31 | 50 | 10 | 0 | 2.0 | 50 |

## Implementation Steps

1. Use a script to insert data via `psql` in the correct order (ICP first, then persona referencing ICP, then campaign referencing ICP, then assets referencing campaign, then metrics)
2. All inserts use the existing project ID `161cfc9d-4e01-4994-8407-f7cf7aa1bcf4`
3. ICP and persona IDs will be generated and captured for foreign key references

## Technical Details

- All inserts go through `psql` using the insert tool (no migrations needed -- these are data inserts, not schema changes)
- RLS policies already allow authenticated inserts for users with org access
- The nurture sequence emails (6 emails) are extracted from the second uploaded doc with subject lines and send dates mapped to `publish_date`
- The press release is mapped as `blog` type (closest match) since there's no `press_release` asset type

