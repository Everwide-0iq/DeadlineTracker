create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#ff463d',
  sort_order integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_length_check check (char_length(btrim(name)) between 1 and 64),
  constraint projects_color_hex_check check (color ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.projects
add column if not exists sort_order integer not null default 0;

alter table public.projects
alter column sort_order set default 0;

insert into public.projects (id, name, color, sort_order, created_by)
values ('00000000-0000-0000-0000-000000000001', 'Общее', '#ff463d', 0, null)
on conflict (id) do update
set
  name = excluded.name,
  color = excluded.color,
  sort_order = 0;

update public.projects
set sort_order = 0
where id = '00000000-0000-0000-0000-000000000001';

with ranked_projects as (
  select
    id,
    row_number() over (order by created_at, id) * 1000 as next_sort_order
  from public.projects
  where id <> '00000000-0000-0000-0000-000000000001'
)
update public.projects
set sort_order = ranked_projects.next_sort_order
from ranked_projects
where public.projects.id = ranked_projects.id
  and public.projects.sort_order = 0;

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  deadline_at timestamptz not null,
  status text not null default 'todo' check (status in ('todo', 'done')),
  board_scope text not null default 'shared' check (board_scope in ('shared', 'personal')),
  project_id uuid references public.projects(id) on delete cascade,
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 340,
  h double precision not null default 190,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cards
add column if not exists board_scope text not null default 'shared';

alter table public.cards
add column if not exists project_id uuid references public.projects(id) on delete cascade;

do $$
begin
  alter table public.cards
  add constraint cards_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade;
exception
  when duplicate_object then null;
end;
$$;

alter table public.cards
alter column board_scope set default 'shared';

update public.cards
set board_scope = 'shared'
where board_scope is null;

alter table public.cards
alter column board_scope set not null;

update public.cards
set project_id = '00000000-0000-0000-0000-000000000001'
where board_scope = 'shared' and project_id is null;

update public.cards
set project_id = null
where board_scope = 'personal';

do $$
begin
  alter table public.cards
  add constraint cards_board_scope_check check (board_scope in ('shared', 'personal'));
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.cards
  add constraint cards_project_scope_check check (
    (board_scope = 'personal' and project_id is null)
    or (board_scope = 'shared' and project_id is not null)
  );
exception
  when duplicate_object then null;
end;
$$;

create index if not exists projects_created_at_idx on public.projects (created_at);
create index if not exists projects_created_by_idx on public.projects (created_by);
create index if not exists projects_sort_order_idx on public.projects (sort_order);
create index if not exists cards_deadline_at_idx on public.cards (deadline_at);
create index if not exists cards_status_idx on public.cards (status);
create index if not exists cards_created_at_idx on public.cards (created_at);
create index if not exists cards_board_scope_idx on public.cards (board_scope);
create index if not exists cards_project_id_idx on public.cards (project_id);
create index if not exists cards_created_by_idx on public.cards (created_by);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_card_ownership()
returns trigger
language plpgsql
as $$
begin
  new.created_by = old.created_by;
  new.board_scope = old.board_scope;
  return new;
end;
$$;

drop trigger if exists protect_cards_ownership on public.cards;
create trigger protect_cards_ownership
before update on public.cards
for each row
execute function public.protect_card_ownership();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

drop trigger if exists set_cards_updated_at on public.cards;
create trigger set_cards_updated_at
before update on public.cards
for each row
execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.cards enable row level security;

drop policy if exists "projects_select_authenticated" on public.projects;
create policy "projects_select_authenticated"
on public.projects
for select
to authenticated
using (true);

drop policy if exists "projects_insert_authenticated" on public.projects;
create policy "projects_insert_authenticated"
on public.projects
for insert
to authenticated
with check (
  auth.role() = 'authenticated'
  and created_by = auth.uid()
);

drop policy if exists "projects_update_authenticated" on public.projects;
create policy "projects_update_authenticated"
on public.projects
for update
to authenticated
using (id <> '00000000-0000-0000-0000-000000000001')
with check (
  id <> '00000000-0000-0000-0000-000000000001'
);

drop policy if exists "projects_delete_authenticated" on public.projects;
create policy "projects_delete_authenticated"
on public.projects
for delete
to authenticated
using (id <> '00000000-0000-0000-0000-000000000001');

drop policy if exists "cards_select_authenticated" on public.cards;
create policy "cards_select_authenticated"
on public.cards
for select
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()));

drop policy if exists "cards_insert_authenticated" on public.cards;
create policy "cards_insert_authenticated"
on public.cards
for insert
to authenticated
with check (
  auth.role() = 'authenticated'
  and created_by = auth.uid()
  and (
    (board_scope = 'personal' and project_id is null)
    or (board_scope = 'shared' and project_id is not null)
  )
);

drop policy if exists "cards_update_authenticated" on public.cards;
create policy "cards_update_authenticated"
on public.cards
for update
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()))
with check (
  (board_scope = 'shared' and project_id is not null)
  or (board_scope = 'personal' and created_by = auth.uid() and project_id is null)
);

drop policy if exists "cards_delete_authenticated" on public.cards;
create policy "cards_delete_authenticated"
on public.cards
for delete
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()));

do $$
begin
  alter publication supabase_realtime add table public.projects;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.cards;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
