ALTER TABLE public.discovery_search_runs
  ADD COLUMN IF NOT EXISTS saved_count integer,
  ADD COLUMN IF NOT EXISTS skipped_count integer;