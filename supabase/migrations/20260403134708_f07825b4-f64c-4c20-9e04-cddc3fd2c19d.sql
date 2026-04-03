ALTER TYPE public.wizard_session_type ADD VALUE IF NOT EXISTS 'campaign';
ALTER TABLE public.wizard_sessions ADD COLUMN IF NOT EXISTS notion_url text;
ALTER TABLE public.wizard_sessions ADD COLUMN IF NOT EXISTS context jsonb DEFAULT '{}'::jsonb;