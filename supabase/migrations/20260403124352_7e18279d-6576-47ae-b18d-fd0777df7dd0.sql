-- Backfill personas from wizard session drafts
UPDATE public.personas p
SET
  organisational_context = COALESCE(NULLIF((ws.draft_output->>'organisational_context')::jsonb, '{}'::jsonb), p.organisational_context),
  buying_behaviour = COALESCE(NULLIF((ws.draft_output->>'buying_behaviour')::jsonb, '{}'::jsonb), p.buying_behaviour),
  goals = CASE WHEN p.goals = '{}'::jsonb THEN COALESCE(NULLIF((ws.draft_output->>'goals')::jsonb, '{}'::jsonb), p.goals) ELSE p.goals END,
  pain_points = CASE WHEN p.pain_points = '{}'::jsonb THEN COALESCE(NULLIF((ws.draft_output->>'pain_points')::jsonb, '{}'::jsonb), p.pain_points) ELSE p.pain_points END,
  how_we_help = CASE WHEN (p.how_we_help IS NULL OR p.how_we_help = '') THEN COALESCE(NULLIF(ws.draft_output->>'how_we_help', ''), p.how_we_help) ELSE p.how_we_help END,
  channel_preferences = CASE WHEN p.channel_preferences = '{}'::jsonb THEN COALESCE(NULLIF((ws.draft_output->>'channel_preferences')::jsonb, '{}'::jsonb), p.channel_preferences) ELSE p.channel_preferences END
FROM public.wizard_sessions ws
WHERE ws.project_id = p.project_id
  AND ws.session_type = 'persona'
  AND ws.status = 'complete'
  AND ws.draft_output->>'persona_name' = p.persona_name
  AND (p.organisational_context = '{}'::jsonb OR p.buying_behaviour = '{}'::jsonb OR p.goals = '{}'::jsonb OR p.pain_points = '{}'::jsonb);