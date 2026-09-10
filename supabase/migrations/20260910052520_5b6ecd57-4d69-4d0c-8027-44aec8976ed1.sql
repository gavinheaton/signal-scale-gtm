DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competitor_archetype') THEN
    CREATE TYPE public.competitor_archetype AS ENUM ('capital_coalition','engineering_systems','applied_research','place_alliance','other');
  END IF;
END $$;

ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS archetype public.competitor_archetype;