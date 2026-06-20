ALTER TABLE projects ADD COLUMN IF NOT EXISTS notion_workspace_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notion_calendar_db_id text;