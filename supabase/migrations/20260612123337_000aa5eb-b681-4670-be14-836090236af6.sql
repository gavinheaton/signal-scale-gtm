ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS propresence_target text DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS propresence_tone_synced_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_propresence_target_check') THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_propresence_target_check
      CHECK (propresence_target IN ('personal', 'company'));
  END IF;
END $$;

ALTER TABLE public.campaign_assets
  ADD COLUMN IF NOT EXISTS propresence_id text,
  ADD COLUMN IF NOT EXISTS propresence_type text,
  ADD COLUMN IF NOT EXISTS propresence_pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS propresence_push_error text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_assets_propresence_type_check') THEN
    ALTER TABLE public.campaign_assets
      ADD CONSTRAINT campaign_assets_propresence_type_check
      CHECK (propresence_type IS NULL OR propresence_type IN ('post', 'article'));
  END IF;
END $$;

ALTER TABLE public.brand_voices
  ADD COLUMN IF NOT EXISTS propresence_synced_at timestamptz;