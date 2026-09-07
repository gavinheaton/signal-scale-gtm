ALTER TABLE public.canvases
ADD COLUMN IF NOT EXISTS completion jsonb NOT NULL DEFAULT '{"canvas":false,"critique":false,"narrative":false}'::jsonb;