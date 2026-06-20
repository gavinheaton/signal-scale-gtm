
DO $$
DECLARE
  v_project_id uuid := '161cfc9d-4e01-4994-8407-f7cf7aa1bcf4';
  v_icp_id uuid;
  v_persona_id uuid;
  v_campaign_id uuid;
BEGIN
  INSERT INTO icps (project_id, segment_name, matrix_category, fit_score, access_score,
    firmographics, psychographics, buyer_roles, anti_icp_signals)
  VALUES (v_project_id, 'Healthcare Innovation Leaders — AU', 'now_account', 9, 7,
    '{"org_types":["Private hospital groups","Health insurers","Aged care providers","Pharmaceutical companies","Health tech startups"],"employee_range":"500-10000","geography":["Sydney","Melbourne","Brisbane"],"deal_size":"$30K-$250K+"}'::jsonb,
    '{"drivers":["AI governance pressure","Board mandates for digital transformation","Peer-referral driven decision making","LinkedIn-first discovery"],"mindset":"Innovation-forward but risk-aware"}'::jsonb,
    '{"roles":["Head of Innovation","CTO","CDO","Chief Transformation Officer","Director of Digital Health"]}'::jsonb,
    '{"signals":["Sub-500 employees","No innovation mandate or digital health budget","No C-suite sponsor for AI","Pure clinical with no tech appetite"]}'::jsonb
  ) RETURNING id INTO v_icp_id;

  INSERT INTO personas (project_id, icp_id, persona_name, role_in_buying,
    goals, pain_points, channel_preferences, how_we_help, buying_behaviour, ai_readiness_score, is_current)
  VALUES (v_project_id, v_icp_id, 'The Healthcare Innovation Champion', 'champion',
    '{"items":["Demonstrate AI productivity gains to C-suite","Build internal AI capability","Run innovation programs with commercial and clinical outcomes"]}'::jsonb,
    '{"items":["Managing AI governance, ethics and compliance risk","Finding partners who speak both healthcare and technology","Stalled internal AI initiatives lacking methodology"]}'::jsonb,
    '{"primary":"LinkedIn","secondary":["Peer referral","Conferences","Webinars","White papers"]}'::jsonb,
    'Bridge AI ambition to implementation with sector credibility, safe innovation frameworks, and proven methodology from J&J, AstraZeneca, and CSIRO ON Prime engagements',
    '{"trust":"Low trust in cold outreach","touchpoints":"2-4 touchpoints before commercial conversation","procurement":"Formal procurement above $50K"}'::jsonb,
    3, true
  ) RETURNING id INTO v_persona_id;

  INSERT INTO campaigns (project_id, name, track, status, objective, launch_date, end_date,
    target_icp_ids, channel_mix)
  VALUES (v_project_id, 'Healthcare AI 90-Day Sprint', 'demand_creation', 'active',
    'Generate 10-15 qualified discovery conversations and 1-2 closed engagements within 90 days, establishing a beachhead in the Australian healthcare AI consulting market',
    '2026-03-19', '2026-06-17',
    ARRAY[v_icp_id],
    '{"LinkedIn":60,"Email":20,"Content":15,"Partnerships":5}'::jsonb
  ) RETURNING id INTO v_campaign_id;

  INSERT INTO campaign_assets (campaign_id, title, asset_type, status, publish_date, persona_target_ids) VALUES
    (v_campaign_id, 'Healthcare AI Readiness Report 2026', 'whitepaper', 'published', '2026-03-19', ARRAY[v_persona_id]),
    (v_campaign_id, 'Healthcare AI Value Proposition One-Pager', 'whitepaper', 'published', '2026-04-01', ARRAY[v_persona_id]),
    (v_campaign_id, 'AI Workshop Discovery One-Pager', 'whitepaper', 'published', '2026-04-01', ARRAY[v_persona_id]),
    (v_campaign_id, 'Nurture Email 1: Welcome + Report Delivery', 'email', 'published', '2026-03-19', ARRAY[v_persona_id]),
    (v_campaign_id, 'Nurture Email 2: Clinical Decision Support', 'email', 'published', '2026-03-23', ARRAY[v_persona_id]),
    (v_campaign_id, 'Nurture Email 3: Admin Automation', 'email', 'published', '2026-03-27', ARRAY[v_persona_id]),
    (v_campaign_id, 'Nurture Email 4: Governance & Ethics', 'email', 'approved', '2026-04-02', ARRAY[v_persona_id]),
    (v_campaign_id, 'Nurture Email 5: Self-Assessment Framework', 'email', 'approved', '2026-04-09', ARRAY[v_persona_id]),
    (v_campaign_id, 'Nurture Email 6: Strategy Session CTA', 'email', 'approved', '2026-04-16', ARRAY[v_persona_id]),
    (v_campaign_id, 'AI Transformation in Healthcare Webinar', 'webinar', 'brief', '2026-05-02', ARRAY[v_persona_id]),
    (v_campaign_id, 'Healthcare AI Press Release', 'blog', 'published', '2026-03-17', ARRAY[v_persona_id]),
    (v_campaign_id, 'LinkedIn Personal Brand Series (Month 1)', 'linkedin_post', 'draft', '2026-03-19', ARRAY[v_persona_id]),
    (v_campaign_id, 'Healthcare Case Study', 'blog', 'brief', '2026-05-18', ARRAY[v_persona_id]);

  INSERT INTO campaign_metrics (campaign_id, date, brand_search_volume, inbound_referrals, pipeline_influenced, share_of_voice_pct, community_engagement, conversion_rate_pct)
  VALUES (v_campaign_id, '2026-03-31', 50, 10, 0, 2.0, 50, 0);
END $$;
