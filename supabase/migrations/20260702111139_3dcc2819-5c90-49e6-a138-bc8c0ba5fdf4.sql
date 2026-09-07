ALTER TABLE public.discovery_organizations
  ADD COLUMN IF NOT EXISTS enrichment jsonb,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;