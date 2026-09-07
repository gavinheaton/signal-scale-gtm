
create type public.canvas_variant as enum ('standard','shared_value');
create type public.canvas_entry_status as enum ('assumption','hypothesis','validated');
create type public.canvas_entry_source as enum ('user','auto','ai_suggestion');
create type public.canvas_validation_outcome as enum ('supports','contradicts','inconclusive');

create table public.canvases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  variant canvas_variant not null default 'standard',
  narrative_md text,
  narrative_generated_at timestamptz,
  critique jsonb,
  critique_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

create table public.canvas_entries (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  box text not null,
  content text not null default '',
  status canvas_entry_status not null default 'assumption',
  source canvas_entry_source not null default 'user',
  source_ref jsonb,
  ai_confidence numeric,
  position int not null default 0,
  is_stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index canvas_entries_canvas_box_idx on public.canvas_entries(canvas_id, box);

create table public.canvas_validations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.canvas_entries(id) on delete cascade,
  conversation_id uuid references public.discovery_conversations(id) on delete set null,
  note text,
  outcome canvas_validation_outcome not null default 'inconclusive',
  created_at timestamptz not null default now()
);
create index canvas_validations_entry_idx on public.canvas_validations(entry_id);

grant select, insert, update, delete on public.canvases to authenticated;
grant select, insert, update, delete on public.canvas_entries to authenticated;
grant select, insert, update, delete on public.canvas_validations to authenticated;
grant all on public.canvases to service_role;
grant all on public.canvas_entries to service_role;
grant all on public.canvas_validations to service_role;

alter table public.canvases enable row level security;
alter table public.canvas_entries enable row level security;
alter table public.canvas_validations enable row level security;

create policy "canvases project access" on public.canvases for all to authenticated
  using (project_id in (select p.id from projects p join org_memberships om on om.org_id = p.org_id where om.user_id = auth.uid()))
  with check (project_id in (select p.id from projects p join org_memberships om on om.org_id = p.org_id where om.user_id = auth.uid()));

create policy "canvas_entries via canvas" on public.canvas_entries for all to authenticated
  using (canvas_id in (select c.id from canvases c join projects p on p.id = c.project_id join org_memberships om on om.org_id = p.org_id where om.user_id = auth.uid()))
  with check (canvas_id in (select c.id from canvases c join projects p on p.id = c.project_id join org_memberships om on om.org_id = p.org_id where om.user_id = auth.uid()));

create policy "canvas_validations via entry" on public.canvas_validations for all to authenticated
  using (entry_id in (select e.id from canvas_entries e join canvases c on c.id = e.canvas_id join projects p on p.id = c.project_id join org_memberships om on om.org_id = p.org_id where om.user_id = auth.uid()))
  with check (entry_id in (select e.id from canvas_entries e join canvases c on c.id = e.canvas_id join projects p on p.id = c.project_id join org_memberships om on om.org_id = p.org_id where om.user_id = auth.uid()));

create trigger canvases_set_updated_at before update on public.canvases
  for each row execute function public.discovery_set_updated_at();
create trigger canvas_entries_set_updated_at before update on public.canvas_entries
  for each row execute function public.discovery_set_updated_at();
