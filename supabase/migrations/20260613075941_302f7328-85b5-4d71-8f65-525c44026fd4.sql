alter table public.projects
  add column if not exists notion_strategy_page_id text,
  add column if not exists notion_strategy_synced_at timestamptz;