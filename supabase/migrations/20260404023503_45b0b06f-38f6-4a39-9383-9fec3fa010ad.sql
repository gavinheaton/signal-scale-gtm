
-- Add 'brand_voice' to wizard_session_type enum
ALTER TYPE wizard_session_type ADD VALUE IF NOT EXISTS 'brand_voice';

-- Add slug column to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS slug text;

-- Create a function to generate slugs from project names
CREATE OR REPLACE FUNCTION public.generate_slug(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(regexp_replace(trim(input), '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
$$;

-- Populate existing projects with slugs
UPDATE projects SET slug = generate_slug(name) WHERE slug IS NULL;

-- Create trigger to auto-set slug on insert/update
CREATE OR REPLACE FUNCTION public.set_project_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_slug(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_project_slug
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION set_project_slug();

-- Create brand_voices table
CREATE TABLE brand_voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  personality_adjectives text[] DEFAULT '{}',
  tone_description text,
  writing_principles jsonb DEFAULT '[]',
  banned_phrases text[] DEFAULT '{}',
  preferred_vocabulary jsonb DEFAULT '[]',
  formatting_rules text[] DEFAULT '{}',
  content_type_guidance jsonb DEFAULT '{}',
  writing_samples jsonb DEFAULT '[]',
  target_audiences jsonb DEFAULT '[]',
  brand_identity jsonb DEFAULT '{}',
  wizard_session_id uuid REFERENCES wizard_sessions(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Validation trigger for status instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_brand_voice_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'in_progress', 'complete') THEN
    RAISE EXCEPTION 'Invalid brand_voice status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_brand_voice_status
  BEFORE INSERT OR UPDATE ON brand_voices
  FOR EACH ROW
  EXECUTE FUNCTION validate_brand_voice_status();

-- Enable RLS
ALTER TABLE brand_voices ENABLE ROW LEVEL SECURITY;

-- RLS policies using same pattern as other tables
CREATE POLICY "Users can view project brand voices"
  ON brand_voices FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = brand_voices.project_id
    AND user_has_org_access(auth.uid(), p.org_id)
  ));

CREATE POLICY "Users can insert project brand voices"
  ON brand_voices FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = brand_voices.project_id
    AND user_has_org_access(auth.uid(), p.org_id)
  ));

CREATE POLICY "Users can update project brand voices"
  ON brand_voices FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = brand_voices.project_id
    AND user_has_org_access(auth.uid(), p.org_id)
  ));
