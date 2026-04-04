ALTER TABLE campaign_assets 
  ADD COLUMN IF NOT EXISTS sequence_order integer,
  ADD COLUMN IF NOT EXISTS offset_days integer,
  ADD COLUMN IF NOT EXISTS production_due date,
  ADD COLUMN IF NOT EXISTS depends_on uuid REFERENCES campaign_assets(id),
  ADD COLUMN IF NOT EXISTS rationale text;