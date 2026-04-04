
CREATE OR REPLACE FUNCTION public.generate_slug(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(regexp_replace(trim(input), '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.set_project_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_slug(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_brand_voice_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'in_progress', 'complete') THEN
    RAISE EXCEPTION 'Invalid brand_voice status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
