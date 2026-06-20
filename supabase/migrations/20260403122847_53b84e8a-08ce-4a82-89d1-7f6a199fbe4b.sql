ALTER TABLE public.personas
ADD COLUMN organisational_context jsonb DEFAULT '{}'::jsonb,
ADD COLUMN buying_behaviour jsonb DEFAULT '{}'::jsonb;