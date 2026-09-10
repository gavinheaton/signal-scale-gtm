ALTER TABLE public.competitors
  ADD COLUMN IF NOT EXISTS identity_verdict text,
  ADD COLUMN IF NOT EXISTS identity_reason text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS domain_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS website text;