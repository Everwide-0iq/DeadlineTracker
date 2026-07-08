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

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  action text not null check (
    action in (
      'card_created',
      'card_updated',
      'card_deadline_changed',
      'card_completed',
      'card_reopened',
      'card_moved',
      'card_deleted',
      'project_created',
      'project_updated',
      'project_deleted',
      'link_created',
      'link_deleted'
    )
  ),
  entity_type text not null check (entity_type in ('card', 'project', 'link')),
  entity_id uuid not null,
  entity_title text not null default '',
  board_scope text not null default 'shared' check (board_scope in ('shared', 'personal')),
  project_id uuid,
  card_id uuid,
  actor_id uuid,
  actor_label text not null default 'Участник',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.activity_events
add column if not exists project_id uuid;

alter table public.activity_events
add column if not exists card_id uuid;

alter table public.activity_events
add column if not exists actor_label text not null default 'Участник';

alter table public.activity_events
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists activity_events_created_at_idx on public.activity_events (created_at desc);
create index if not exists activity_events_board_scope_idx on public.activity_events (board_scope);
create index if not exists activity_events_project_id_idx on public.activity_events (project_id);
create index if not exists activity_events_card_id_idx on public.activity_events (card_id);
create index if not exists activity_events_actor_id_idx on public.activity_events (actor_id);

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

create or replace function public.get_activity_actor_label()
returns text
language plpgsql
stable
as $$
declare
  raw_email text;
begin
  raw_email := auth.jwt() ->> 'email';
  return coalesce(nullif(split_part(raw_email, '@', 1), ''), 'Участник');
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

create or replace function public.log_card_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_action text;
  next_title text;
  next_scope text;
  next_project_id uuid;
  next_card_id uuid;
  next_entity_id uuid;
  next_metadata jsonb;
begin
  if tg_op = 'INSERT' then
    next_action := 'card_created';
    next_title := new.title;
    next_scope := new.board_scope;
    next_project_id := new.project_id;
    next_card_id := new.id;
    next_entity_id := new.id;
    next_metadata := jsonb_build_object('title', new.title);
  elsif tg_op = 'DELETE' then
    next_action := 'card_deleted';
    next_title := old.title;
    next_scope := old.board_scope;
    next_project_id := old.project_id;
    next_card_id := old.id;
    next_entity_id := old.id;
    next_metadata := jsonb_build_object('title', old.title);
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      next_action := case when new.status = 'done' then 'card_completed' else 'card_reopened' end;
    elsif old.deadline_at is distinct from new.deadline_at then
      next_action := 'card_deadline_changed';
    elsif old.title is distinct from new.title
      or old.description is distinct from new.description
      or old.w is distinct from new.w
      or old.h is distinct from new.h then
      next_action := 'card_updated';
    else
      return new;
    end if;

    next_title := new.title;
    next_scope := new.board_scope;
    next_project_id := new.project_id;
    next_card_id := new.id;
    next_entity_id := new.id;
    next_metadata := jsonb_build_object(
      'title',
      new.title,
      'oldTitle',
      old.title,
      'oldStatus',
      old.status,
      'newStatus',
      new.status
    );
  end if;

  begin
    insert into public.activity_events (
      action,
      actor_id,
      actor_label,
      board_scope,
      card_id,
      entity_id,
      entity_title,
      entity_type,
      metadata,
      project_id
    )
    values (
      next_action,
      auth.uid(),
      public.get_activity_actor_label(),
      next_scope,
      next_card_id,
      next_entity_id,
      next_title,
      'card',
      next_metadata,
      next_project_id
    );
  exception
    when others then null;
  end;

  return coalesce(new, old);
end;
$$;

create or replace function public.log_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_action text;
  next_id uuid;
  next_title text;
begin
  if tg_op = 'INSERT' then
    next_action := 'project_created';
    next_id := new.id;
    next_title := new.name;
  elsif tg_op = 'DELETE' then
    next_action := 'project_deleted';
    next_id := old.id;
    next_title := old.name;
  elsif tg_op = 'UPDATE' then
    if old.name is not distinct from new.name and old.color is not distinct from new.color then
      return new;
    end if;

    next_action := 'project_updated';
    next_id := new.id;
    next_title := new.name;
  end if;

  begin
    insert into public.activity_events (
      action,
      actor_id,
      actor_label,
      board_scope,
      entity_id,
      entity_title,
      entity_type,
      metadata,
      project_id
    )
    values (
      next_action,
      auth.uid(),
      public.get_activity_actor_label(),
      'shared',
      next_id,
      next_title,
      'project',
      jsonb_build_object('name', next_title),
      next_id
    );
  exception
    when others then null;
  end;

  return coalesce(new, old);
end;
$$;

create or replace function public.log_card_link_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_action text;
  next_id uuid;
  next_scope text;
  next_project_id uuid;
  next_card_id uuid;
begin
  if tg_op = 'INSERT' then
    next_action := 'link_created';
    next_id := new.id;
    next_scope := new.board_scope;
    next_project_id := new.project_id;
    next_card_id := new.from_card_id;
  elsif tg_op = 'DELETE' then
    next_action := 'link_deleted';
    next_id := old.id;
    next_scope := old.board_scope;
    next_project_id := old.project_id;
    next_card_id := old.from_card_id;
  else
    return new;
  end if;

  begin
    insert into public.activity_events (
      action,
      actor_id,
      actor_label,
      board_scope,
      card_id,
      entity_id,
      entity_title,
      entity_type,
      metadata,
      project_id
    )
    values (
      next_action,
      auth.uid(),
      public.get_activity_actor_label(),
      next_scope,
      next_card_id,
      next_id,
      'Связь карточек',
      'link',
      jsonb_build_object('cardId', next_card_id),
      next_project_id
    );
  exception
    when others then null;
  end;

  return coalesce(new, old);
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

drop trigger if exists log_cards_activity on public.cards;
create trigger log_cards_activity
after insert or update or delete on public.cards
for each row
execute function public.log_card_activity();

drop trigger if exists log_projects_activity on public.projects;
create trigger log_projects_activity
after insert or update or delete on public.projects
for each row
execute function public.log_project_activity();

drop trigger if exists log_card_links_activity on public.card_links;
create trigger log_card_links_activity
after insert or delete on public.card_links
for each row
execute function public.log_card_link_activity();

alter table public.projects enable row level security;
alter table public.cards enable row level security;
alter table public.card_links enable row level security;
alter table public.activity_events enable row level security;

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

drop policy if exists "activity_events_select_authenticated" on public.activity_events;
create policy "activity_events_select_authenticated"
on public.activity_events
for select
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and actor_id = auth.uid()));

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
  alter publication supabase_realtime add table public.activity_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
