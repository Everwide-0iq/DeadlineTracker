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

create table if not exists public.card_links (
  id uuid primary key default gen_random_uuid(),
  from_card_id uuid not null references public.cards(id) on delete cascade,
  from_side text not null check (from_side in ('top', 'right', 'bottom', 'left')),
  to_card_id uuid not null references public.cards(id) on delete cascade,
  to_side text not null check (to_side in ('top', 'right', 'bottom', 'left')),
  board_scope text not null default 'shared' check (board_scope in ('shared', 'personal')),
  project_id uuid references public.projects(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_links_not_self_check check (from_card_id <> to_card_id),
  constraint card_links_project_scope_check check (
    (board_scope = 'personal' and project_id is null)
    or (board_scope = 'shared' and project_id is not null)
  )
);

alter table public.card_links
add column if not exists board_scope text not null default 'shared';

alter table public.card_links
add column if not exists project_id uuid references public.projects(id) on delete cascade;

alter table public.card_links
alter column board_scope set default 'shared';

update public.card_links
set board_scope = 'shared'
where board_scope is null;

alter table public.card_links
alter column board_scope set not null;

create table if not exists public.board_texts (
  id uuid primary key default gen_random_uuid(),
  content text not null default 'Text',
  board_scope text not null default 'shared' check (board_scope in ('shared', 'personal')),
  project_id uuid references public.projects(id) on delete cascade,
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 360,
  font_size integer not null default 36 check (font_size between 18 and 86),
  font_family text not null default 'display' check (font_family in ('display', 'mono', 'serif', 'system')),
  color text not null default '#f7f7f8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_texts_content_length_check check (char_length(btrim(content)) between 1 and 520),
  constraint board_texts_scope_check check (
    (board_scope = 'personal' and project_id is null)
    or (board_scope = 'shared' and project_id is not null)
  )
);

alter table public.board_texts
add column if not exists board_scope text not null default 'shared';

alter table public.board_texts
add column if not exists project_id uuid references public.projects(id) on delete cascade;

alter table public.board_texts
add column if not exists font_size integer not null default 36;

alter table public.board_texts
add column if not exists font_family text not null default 'display';

alter table public.board_texts
add column if not exists color text not null default '#f7f7f8';

alter table public.board_texts
add column if not exists w double precision not null default 360;

alter table public.board_texts
alter column board_scope set default 'shared';

update public.board_texts
set board_scope = 'shared'
where board_scope is null;

alter table public.board_texts
alter column board_scope set not null;

update public.board_texts
set project_id = '00000000-0000-0000-0000-000000000001'
where board_scope = 'shared' and project_id is null;

update public.board_texts
set project_id = null
where board_scope = 'personal';

do $$
begin
  alter table public.board_texts
  add constraint board_texts_content_length_check check (char_length(btrim(content)) between 1 and 520);
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.board_texts
  add constraint board_texts_width_check check (w between 140 and 1400);
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.board_texts
  add constraint board_texts_font_size_check check (font_size between 18 and 86);
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.board_texts
  add constraint board_texts_font_family_check check (font_family in ('display', 'mono', 'serif', 'system'));
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.board_texts
  add constraint board_texts_color_hex_check check (color ~ '^#[0-9A-Fa-f]{6}$');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.board_texts
  add constraint board_texts_scope_check check (
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
create index if not exists card_links_from_card_id_idx on public.card_links (from_card_id);
create index if not exists card_links_to_card_id_idx on public.card_links (to_card_id);
create index if not exists card_links_board_scope_idx on public.card_links (board_scope);
create index if not exists card_links_project_id_idx on public.card_links (project_id);
create index if not exists card_links_created_by_idx on public.card_links (created_by);
create index if not exists board_texts_board_scope_idx on public.board_texts (board_scope);
create index if not exists board_texts_project_id_idx on public.board_texts (project_id);
create index if not exists board_texts_created_by_idx on public.board_texts (created_by);
create index if not exists board_texts_created_at_idx on public.board_texts (created_at);

with duplicate_card_links as (
  select
    id,
    row_number() over (
      partition by from_card_id, from_side, to_card_id, to_side
      order by created_at, id
    ) as duplicate_rank
  from public.card_links
)
delete from public.card_links
using duplicate_card_links
where public.card_links.id = duplicate_card_links.id
  and duplicate_card_links.duplicate_rank > 1;

create unique index if not exists card_links_unique_connection_idx
on public.card_links (from_card_id, from_side, to_card_id, to_side);

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

create or replace function public.validate_card_link_scope()
returns trigger
language plpgsql
as $$
declare
  source_card public.cards%rowtype;
  target_card public.cards%rowtype;
begin
  select * into source_card
  from public.cards
  where id = new.from_card_id;

  select * into target_card
  from public.cards
  where id = new.to_card_id;

  if source_card.id is null or target_card.id is null then
    raise exception 'Linked cards were not found';
  end if;

  if source_card.id = target_card.id then
    raise exception 'A card cannot be linked to itself';
  end if;

  if source_card.board_scope <> target_card.board_scope then
    raise exception 'Cards from different board scopes cannot be linked';
  end if;

  if source_card.board_scope = 'shared' then
    if source_card.project_id is distinct from target_card.project_id then
      raise exception 'Cards from different projects cannot be linked';
    end if;

    new.board_scope = 'shared';
    new.project_id = source_card.project_id;
    return new;
  end if;

  if source_card.created_by is distinct from auth.uid()
    or target_card.created_by is distinct from auth.uid() then
    raise exception 'Personal card links can only connect your own cards';
  end if;

  new.board_scope = 'personal';
  new.project_id = null;
  return new;
end;
$$;

create or replace function public.protect_card_link_ownership()
returns trigger
language plpgsql
as $$
begin
  new.created_by = old.created_by;
  return new;
end;
$$;

create or replace function public.protect_board_text_ownership()
returns trigger
language plpgsql
as $$
begin
  new.created_by = old.created_by;
  new.board_scope = old.board_scope;
  new.project_id = old.project_id;
  return new;
end;
$$;

drop trigger if exists protect_cards_ownership on public.cards;
create trigger protect_cards_ownership
before update on public.cards
for each row
execute function public.protect_card_ownership();

drop trigger if exists protect_card_links_ownership on public.card_links;
create trigger protect_card_links_ownership
before update on public.card_links
for each row
execute function public.protect_card_link_ownership();

drop trigger if exists protect_board_texts_ownership on public.board_texts;
create trigger protect_board_texts_ownership
before update on public.board_texts
for each row
execute function public.protect_board_text_ownership();

drop trigger if exists validate_card_links_scope on public.card_links;
create trigger validate_card_links_scope
before insert or update on public.card_links
for each row
execute function public.validate_card_link_scope();

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

drop trigger if exists set_card_links_updated_at on public.card_links;
create trigger set_card_links_updated_at
before update on public.card_links
for each row
execute function public.set_updated_at();

drop trigger if exists set_board_texts_updated_at on public.board_texts;
create trigger set_board_texts_updated_at
before update on public.board_texts
for each row
execute function public.set_updated_at();

drop trigger if exists log_cards_activity on public.cards;
drop trigger if exists log_projects_activity on public.projects;
drop trigger if exists log_card_links_activity on public.card_links;

drop function if exists public.log_card_activity() cascade;
drop function if exists public.log_project_activity() cascade;
drop function if exists public.log_card_link_activity() cascade;
drop function if exists public.get_activity_actor_label() cascade;
drop table if exists public.activity_events cascade;

alter table public.projects enable row level security;
alter table public.cards enable row level security;
alter table public.card_links enable row level security;
alter table public.board_texts enable row level security;

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

drop policy if exists "card_links_select_authenticated" on public.card_links;
create policy "card_links_select_authenticated"
on public.card_links
for select
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()));

drop policy if exists "card_links_insert_authenticated" on public.card_links;
create policy "card_links_insert_authenticated"
on public.card_links
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

drop policy if exists "card_links_update_authenticated" on public.card_links;
create policy "card_links_update_authenticated"
on public.card_links
for update
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()))
with check (
  board_scope = 'shared'
  or (board_scope = 'personal' and created_by = auth.uid())
);

drop policy if exists "card_links_delete_authenticated" on public.card_links;
create policy "card_links_delete_authenticated"
on public.card_links
for delete
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()));

drop policy if exists "board_texts_select_authenticated" on public.board_texts;
create policy "board_texts_select_authenticated"
on public.board_texts
for select
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()));

drop policy if exists "board_texts_insert_authenticated" on public.board_texts;
create policy "board_texts_insert_authenticated"
on public.board_texts
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

drop policy if exists "board_texts_update_authenticated" on public.board_texts;
create policy "board_texts_update_authenticated"
on public.board_texts
for update
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()))
with check (
  (board_scope = 'shared' and project_id is not null)
  or (board_scope = 'personal' and created_by = auth.uid() and project_id is null)
);

drop policy if exists "board_texts_delete_authenticated" on public.board_texts;
create policy "board_texts_delete_authenticated"
on public.board_texts
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

do $$
begin
  alter publication supabase_realtime add table public.card_links;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.board_texts;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
