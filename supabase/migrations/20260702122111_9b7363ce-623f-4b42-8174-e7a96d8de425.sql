ALTER TABLE public.discovery_organizations
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS website_verified boolean NOT NULL DEFAULT false;

ALTER TYPE public.discovery_enrichment_source ADD VALUE IF NOT EXISTS 'firecrawl';