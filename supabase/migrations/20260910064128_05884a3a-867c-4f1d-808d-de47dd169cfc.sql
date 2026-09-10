DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['stakeholder','funder','infrastructure_owner','research_body']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'ecosystem_node_kind' AND e.enumlabel = v
    ) THEN
      EXECUTE format('ALTER TYPE public.ecosystem_node_kind ADD VALUE %L', v);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['funds','owns_infrastructure','supplies','collaborates_with','advocates_for']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'ecosystem_edge_kind' AND e.enumlabel = v
    ) THEN
      EXECUTE format('ALTER TYPE public.ecosystem_edge_kind ADD VALUE %L', v);
    END IF;
  END LOOP;
END $$;