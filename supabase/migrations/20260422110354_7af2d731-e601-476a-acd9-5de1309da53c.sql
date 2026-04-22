DO $$
DECLARE
  _session_id uuid := '47baebe4-418d-45d5-b23b-0901614e182c';
  _project_id uuid;
  _draft jsonb;
  _campaign_id uuid;
  _calendar jsonb;
  _item jsonb;
  _idx int;
  _seq int;
  _asset_type asset_type;
  _raw text;
  _new_asset_id uuid;
  _seq_to_id jsonb := '{}'::jsonb;
  _dep int;
  _my_id uuid;
  _dep_id uuid;
BEGIN
  SELECT project_id, draft_output INTO _project_id, _draft
  FROM wizard_sessions WHERE id = _session_id;

  IF _project_id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;

  -- Insert campaign
  INSERT INTO campaigns (project_id, name, track, status, objective, target_icp_ids, channel_mix, launch_date, end_date)
  VALUES (
    _project_id,
    COALESCE(_draft->>'campaign_name', 'Recovered campaign'),
    'demand_creation'::campaign_track,
    'planning'::campaign_status,
    'Twelve-week newsletter arc — recovered from wizard draft. Mixed Strategy / AI / Innovation / GTM threads with weekly The Lens emails and blog anchors.',
    ARRAY[]::uuid[],
    COALESCE(_draft->'channel_mix', '{}'::jsonb),
    NULLIF(_draft->>'launch_date','')::date,
    NULLIF(_draft->>'end_date','')::date
  )
  RETURNING id INTO _campaign_id;

  _calendar := _draft->'content_calendar';

  -- First pass: insert assets, build sequence_order -> uuid map
  FOR _idx IN 0 .. (jsonb_array_length(_calendar) - 1) LOOP
    _item := _calendar->_idx;
    _seq := COALESCE((_item->>'sequence_order')::int, _idx + 1);
    _raw := lower(COALESCE(_item->>'format','') || ' ' || COALESCE(_item->>'channel','') || ' ' || COALESCE(_item->>'content_type',''));

    _asset_type := CASE
      WHEN _raw LIKE '%email%' OR _raw LIKE '%newsletter%' OR _raw LIKE '%the lens%' THEN 'email'
      WHEN _raw LIKE '%linkedin%' THEN 'linkedin_post'
      WHEN _raw LIKE '%video%' THEN 'video'
      WHEN _raw LIKE '%podcast%' THEN 'podcast'
      WHEN _raw LIKE '%webinar%' THEN 'webinar'
      WHEN _raw LIKE '%whitepaper%' OR _raw LIKE '%white paper%' THEN 'whitepaper'
      WHEN _raw LIKE '%press%' THEN 'press_release'
      ELSE 'blog'
    END::asset_type;

    INSERT INTO campaign_assets (
      campaign_id, asset_type, title, status,
      publish_date, production_due, sequence_order, offset_days, rationale, persona_target_ids
    ) VALUES (
      _campaign_id,
      _asset_type,
      COALESCE(_item->>'title', 'Asset ' || (_idx + 1)::text),
      'brief'::asset_status,
      NULLIF(_item->>'publish_date','')::date,
      NULLIF(_item->>'production_due','')::date,
      _seq,
      NULLIF(_item->>'offset_days','')::int,
      _item->>'rationale',
      ARRAY[]::uuid[]
    )
    RETURNING id INTO _new_asset_id;

    _seq_to_id := _seq_to_id || jsonb_build_object(_seq::text, _new_asset_id::text);
  END LOOP;

  -- Second pass: resolve depends_on
  FOR _idx IN 0 .. (jsonb_array_length(_calendar) - 1) LOOP
    _item := _calendar->_idx;
    _seq := COALESCE((_item->>'sequence_order')::int, _idx + 1);
    BEGIN
      _dep := (_item->>'depends_on')::int;
    EXCEPTION WHEN others THEN
      _dep := NULL;
    END;
    IF _dep IS NOT NULL AND _seq_to_id ? _dep::text AND _seq_to_id ? _seq::text THEN
      _my_id := (_seq_to_id->>_seq::text)::uuid;
      _dep_id := (_seq_to_id->>_dep::text)::uuid;
      IF _my_id <> _dep_id THEN
        UPDATE campaign_assets SET depends_on = _dep_id WHERE id = _my_id;
      END IF;
    END IF;
  END LOOP;

  -- Mark session complete
  UPDATE wizard_sessions
  SET status = 'complete'::wizard_session_status,
      draft_output = draft_output || jsonb_build_object('is_complete', true, 'recovered_campaign_id', _campaign_id)
  WHERE id = _session_id;

  RAISE NOTICE 'Recovered campaign % with % assets', _campaign_id, jsonb_array_length(_calendar);
END $$;