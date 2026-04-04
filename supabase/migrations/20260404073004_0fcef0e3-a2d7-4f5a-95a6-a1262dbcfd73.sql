
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  key_hash text not null unique,
  key_prefix text not null,
  label text default 'Cowork Sync',
  created_at timestamptz default now(),
  last_used_at timestamptz
);

alter table public.api_keys enable row level security;

create policy "Users can view own keys"
  on public.api_keys for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own keys"
  on public.api_keys for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own keys"
  on public.api_keys for delete to authenticated
  using (user_id = auth.uid());
