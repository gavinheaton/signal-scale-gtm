ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS notion_parent_page_id text,
  ADD COLUMN IF NOT EXISTS notion_property_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notion_channel_db_ids jsonb NOT NULL DEFAULT '{}'::jsonb;