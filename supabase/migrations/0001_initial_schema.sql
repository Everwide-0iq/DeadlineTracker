create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', false, 2097152, array['image/webp'])
on conflict (id) do update
set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/webp'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/webp'])
on conflict (id) do update
set
  public = false,
  file_size_limit = 524288,
  allowed_mime_types = array['image/webp'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('todo-images', 'todo-images', false, 2097152, array['image/webp'])
on conflict (id) do update
set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/webp'];

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

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  avatar_path text,
  active_color text not null default '#65e7ff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_nickname_check check (
    nickname = btrim(nickname)
    and char_length(nickname) between 1 and 32
    and nickname !~ '[[:cntrl:]]'
  ),
  constraint profiles_avatar_path_check check (
    avatar_path is null or (
      char_length(avatar_path) between 8 and 512
      and split_part(avatar_path, '/', 1) = id::text
      and lower(avatar_path) like '%.webp'
    )
  ),
  constraint profiles_active_color_check check (active_color ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.profiles
add column if not exists avatar_path text;

alter table public.profiles
add column if not exists active_color text not null default '#65e7ff';

insert into public.profiles (id, nickname)
select
  user_record.id,
  coalesce(
    nullif(
      left(
        btrim(
          regexp_replace(
            coalesce(
              user_record.raw_user_meta_data ->> 'nickname',
              split_part(coalesce(user_record.email, ''), '@', 1)
            ),
            '[[:cntrl:]]',
            '',
            'g'
          )
        ),
        32
      ),
      ''
    ),
    'Member'
  )
from auth.users as user_record
on conflict (id) do nothing;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  default_nickname text;
begin
  default_nickname = coalesce(
    nullif(
      left(
        btrim(
          regexp_replace(
            coalesce(
              new.raw_user_meta_data ->> 'nickname',
              split_part(coalesce(new.email, ''), '@', 1)
            ),
            '[[:cntrl:]]',
            '',
            'g'
          )
        ),
        32
      ),
      ''
    ),
    'Member'
  );

  insert into public.profiles (id, nickname)
  values (new.id, default_nickname)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
after insert on auth.users
for each row
execute function public.create_profile_for_new_user();

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  deadline_at timestamptz not null,
  status text not null default 'todo' check (status in ('todo', 'done')),
  is_active boolean not null default false,
  active_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  board_scope text not null default 'shared' check (board_scope in ('shared', 'personal')),
  project_id uuid references public.projects(id) on delete cascade,
  image_path text,
  image_width integer,
  image_height integer,
  image_size integer,
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
add column if not exists is_active boolean not null default false;

alter table public.cards
add column if not exists active_by uuid references public.profiles(id) on delete set null;

alter table public.cards
add column if not exists completed_at timestamptz;

alter table public.cards
add column if not exists completed_by uuid references public.profiles(id) on delete set null;

alter table public.cards
add column if not exists project_id uuid references public.projects(id) on delete cascade;

alter table public.cards
add column if not exists image_path text;

alter table public.cards
add column if not exists image_width integer;

alter table public.cards
add column if not exists image_height integer;

alter table public.cards
add column if not exists image_size integer;

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

update public.cards
set active_by = null
where not is_active;

update public.cards
set
  is_active = false,
  active_by = null
where status = 'done';

update public.cards
set completed_at = null
where status <> 'done';

update public.cards
set completed_by = null
where status <> 'done';

do $$
begin
  alter table public.cards
  add constraint cards_board_scope_check check (board_scope in ('shared', 'personal'));
exception
  when duplicate_object then null;
end;
$$;

alter table public.cards
drop constraint if exists cards_activity_state_check;

alter table public.cards
add constraint cards_activity_state_check check (
  (is_active or active_by is null)
  and (status <> 'done' or (not is_active and active_by is null))
  and (status = 'done' or (completed_at is null and completed_by is null))
);

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

alter table public.cards
drop constraint if exists cards_image_metadata_check;

do $$
begin
  alter table public.cards
  add constraint cards_image_metadata_check check (
    (
      image_path is null
      and image_width is null
      and image_height is null
      and image_size is null
    )
    or (
      image_path is not null
      and char_length(image_path) between 8 and 512
      and image_width between 1 and 4096
      and image_height between 1 and 4096
      and image_size between 1 and 2097152
    )
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.todo_blocks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  deadline_at timestamptz,
  board_scope text not null default 'shared' check (board_scope in ('shared', 'personal')),
  project_id uuid references public.projects(id) on delete cascade,
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 420,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todo_blocks_content_geometry_check check (
    char_length(btrim(title)) between 1 and 120
    and (deadline_at is null or isfinite(deadline_at))
    and x between -10000000 and 10000000
    and y between -10000000 and 10000000
    and w between 320 and 1600
  ),
  constraint todo_blocks_scope_check check (
    (board_scope = 'personal' and project_id is null)
    or (board_scope = 'shared' and project_id is not null)
  )
);

create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.todo_blocks(id) on delete cascade,
  title text not null,
  description text,
  is_done boolean not null default false,
  is_active boolean not null default false,
  active_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  sort_order integer not null default 0,
  image_path text,
  image_width integer,
  image_height integer,
  image_size integer,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todo_items_content_check check (
    char_length(btrim(title)) between 1 and 160
    and (description is null or char_length(description) <= 1800)
    and sort_order between 0 and 1000000000
  ),
  constraint todo_items_state_check check (
    (is_active or active_by is null)
    and (not is_done or (not is_active and active_by is null))
    and (is_done or (completed_at is null and completed_by is null))
  ),
  constraint todo_items_image_metadata_check check (
    (
      image_path is null
      and image_width is null
      and image_height is null
      and image_size is null
    )
    or (
      image_path is not null
      and char_length(image_path) between 8 and 512
      and image_width between 1 and 4096
      and image_height between 1 and 4096
      and image_size between 1 and 2097152
    )
  )
);

create table if not exists public.card_links (
  id uuid primary key default gen_random_uuid(),
  from_card_id uuid references public.cards(id) on delete cascade,
  from_todo_block_id uuid references public.todo_blocks(id) on delete cascade,
  from_side text not null check (from_side in ('top', 'right', 'bottom', 'left')),
  to_card_id uuid references public.cards(id) on delete cascade,
  to_todo_block_id uuid references public.todo_blocks(id) on delete cascade,
  to_side text not null check (to_side in ('top', 'right', 'bottom', 'left')),
  board_scope text not null default 'shared' check (board_scope in ('shared', 'personal')),
  project_id uuid references public.projects(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_links_source_check check (num_nonnulls(from_card_id, from_todo_block_id) = 1),
  constraint card_links_target_check check (num_nonnulls(to_card_id, to_todo_block_id) = 1),
  constraint card_links_not_self_check check (
    not (from_card_id is not null and from_card_id = to_card_id)
    and not (from_todo_block_id is not null and from_todo_block_id = to_todo_block_id)
  ),
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
add column if not exists from_todo_block_id uuid references public.todo_blocks(id) on delete cascade;

alter table public.card_links
add column if not exists to_todo_block_id uuid references public.todo_blocks(id) on delete cascade;

alter table public.card_links
alter column from_card_id drop not null;

alter table public.card_links
alter column to_card_id drop not null;

alter table public.card_links
alter column board_scope set default 'shared';

update public.card_links
set board_scope = 'shared'
where board_scope is null;

alter table public.card_links
alter column board_scope set not null;

alter table public.card_links
drop constraint if exists card_links_source_check;

alter table public.card_links
add constraint card_links_source_check check (num_nonnulls(from_card_id, from_todo_block_id) = 1);

alter table public.card_links
drop constraint if exists card_links_target_check;

alter table public.card_links
add constraint card_links_target_check check (num_nonnulls(to_card_id, to_todo_block_id) = 1);

alter table public.card_links
drop constraint if exists card_links_not_self_check;

alter table public.card_links
add constraint card_links_not_self_check check (
  not (from_card_id is not null and from_card_id = to_card_id)
  and not (from_todo_block_id is not null and from_todo_block_id = to_todo_block_id)
);

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

create table if not exists public.card_image_cleanup_queue (
  image_path text primary key,
  requested_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint card_image_cleanup_path_check check (char_length(image_path) between 8 and 512)
);

create table if not exists public.todo_image_cleanup_queue (
  image_path text primary key,
  requested_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint todo_image_cleanup_path_check check (char_length(image_path) between 8 and 512)
);

alter table public.cards
drop constraint if exists cards_content_geometry_check;

alter table public.cards
add constraint cards_content_geometry_check check (
  char_length(btrim(title)) between 1 and 120
  and (description is null or char_length(description) <= 1800)
  and isfinite(deadline_at)
  and x between -10000000 and 10000000
  and y between -10000000 and 10000000
  and w between 280 and 3200
  and h between 120 and 6000
) not valid;

do $$
begin
  alter table public.cards validate constraint cards_content_geometry_check;
exception
  when check_violation then null;
end;
$$;

alter table public.board_texts
drop constraint if exists board_texts_position_check;

alter table public.board_texts
add constraint board_texts_position_check check (
  x between -10000000 and 10000000
  and y between -10000000 and 10000000
) not valid;

do $$
begin
  alter table public.board_texts validate constraint board_texts_position_check;
exception
  when check_violation then null;
end;
$$;

alter table public.projects
drop constraint if exists projects_sort_order_check;

alter table public.projects
add constraint projects_sort_order_check check (sort_order between 0 and 1000000000) not valid;

do $$
begin
  alter table public.projects validate constraint projects_sort_order_check;
exception
  when check_violation then null;
end;
$$;

create index if not exists projects_created_at_idx on public.projects (created_at);
create index if not exists projects_created_by_idx on public.projects (created_by);
create index if not exists projects_sort_order_idx on public.projects (sort_order);
create index if not exists profiles_updated_at_idx on public.profiles (updated_at);
create index if not exists cards_deadline_at_idx on public.cards (deadline_at);
create index if not exists cards_status_idx on public.cards (status);
create index if not exists cards_created_at_idx on public.cards (created_at);
create index if not exists cards_board_scope_idx on public.cards (board_scope);
create index if not exists cards_project_id_idx on public.cards (project_id);
create index if not exists cards_created_by_idx on public.cards (created_by);
create index if not exists cards_active_by_idx on public.cards (active_by) where active_by is not null;
create index if not exists cards_completed_at_idx on public.cards (completed_at) where completed_at is not null;
create index if not exists cards_completed_by_idx on public.cards (completed_by) where completed_by is not null;
create index if not exists cards_image_path_idx on public.cards (image_path) where image_path is not null;
create index if not exists todo_blocks_board_scope_idx on public.todo_blocks (board_scope);
create index if not exists todo_blocks_project_id_idx on public.todo_blocks (project_id);
create index if not exists todo_blocks_deadline_at_idx on public.todo_blocks (deadline_at) where deadline_at is not null;
create index if not exists todo_blocks_created_by_idx on public.todo_blocks (created_by);
create index if not exists todo_items_block_order_idx on public.todo_items (block_id, sort_order, created_at);
create index if not exists todo_items_active_by_idx on public.todo_items (active_by) where active_by is not null;
create index if not exists todo_items_completed_by_idx on public.todo_items (completed_by) where completed_by is not null;
create index if not exists todo_items_image_path_idx on public.todo_items (image_path) where image_path is not null;
create index if not exists card_links_from_card_id_idx on public.card_links (from_card_id);
create index if not exists card_links_to_card_id_idx on public.card_links (to_card_id);
create index if not exists card_links_from_todo_block_id_idx on public.card_links (from_todo_block_id);
create index if not exists card_links_to_todo_block_id_idx on public.card_links (to_todo_block_id);
create index if not exists card_links_board_scope_idx on public.card_links (board_scope);
create index if not exists card_links_project_id_idx on public.card_links (project_id);
create index if not exists card_links_created_by_idx on public.card_links (created_by);
create index if not exists board_texts_board_scope_idx on public.board_texts (board_scope);
create index if not exists board_texts_project_id_idx on public.board_texts (project_id);
create index if not exists board_texts_created_by_idx on public.board_texts (created_by);
create index if not exists board_texts_created_at_idx on public.board_texts (created_at);
create index if not exists card_image_cleanup_requested_by_idx
on public.card_image_cleanup_queue (requested_by, created_at);
create index if not exists todo_image_cleanup_requested_by_idx
on public.todo_image_cleanup_queue (requested_by, created_at);

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

drop index if exists public.card_links_unique_connection_idx;

create unique index if not exists card_links_unique_card_card_idx
on public.card_links (from_card_id, from_side, to_card_id, to_side)
where from_card_id is not null and to_card_id is not null;

create unique index if not exists card_links_unique_card_todo_idx
on public.card_links (from_card_id, from_side, to_todo_block_id, to_side)
where from_card_id is not null and to_todo_block_id is not null;

create unique index if not exists card_links_unique_todo_card_idx
on public.card_links (from_todo_block_id, from_side, to_card_id, to_side)
where from_todo_block_id is not null and to_card_id is not null;

create unique index if not exists card_links_unique_todo_todo_idx
on public.card_links (from_todo_block_id, from_side, to_todo_block_id, to_side)
where from_todo_block_id is not null and to_todo_block_id is not null;

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
  new.created_at = old.created_at;
  new.board_scope = old.board_scope;
  return new;
end;
$$;

create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
as $$
begin
  new.id = old.id;
  new.created_at = old.created_at;
  return new;
end;
$$;

create or replace function public.normalize_card_state()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' then
    new.is_active = false;
    new.active_by = null;

    if tg_op = 'INSERT' then
      new.completed_at = now();
      new.completed_by = auth.uid();
    elsif old.status is distinct from 'done' then
      new.completed_at = now();
      new.completed_by = auth.uid();
    else
      new.completed_at = old.completed_at;
      new.completed_by = old.completed_by;
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' then
    new.completed_at = null;
    new.completed_by = null;
  else
    if old.status = 'done' then
      new.completed_at = null;
      new.completed_by = null;
    else
      new.completed_at = old.completed_at;
      new.completed_by = old.completed_by;
    end if;
  end if;

  if not new.is_active then
    new.active_by = null;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.active_by = auth.uid();
  elsif new.is_active is distinct from old.is_active
    or new.active_by is distinct from old.active_by then
    new.active_by = auth.uid();
  else
    new.active_by = old.active_by;
  end if;

  return new;
end;
$$;

create or replace function public.protect_todo_block_ownership()
returns trigger
language plpgsql
as $$
begin
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  new.board_scope = old.board_scope;
  new.project_id = old.project_id;
  return new;
end;
$$;

create or replace function public.protect_todo_item_ownership()
returns trigger
language plpgsql
as $$
begin
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  new.block_id = old.block_id;
  return new;
end;
$$;

create or replace function public.normalize_todo_item_state()
returns trigger
language plpgsql
as $$
begin
  if new.is_done then
    new.is_active = false;
    new.active_by = null;

    if tg_op = 'INSERT' then
      new.completed_at = now();
      new.completed_by = auth.uid();
    elsif old.is_done is distinct from true then
      new.completed_at = now();
      new.completed_by = auth.uid();
    else
      new.completed_at = old.completed_at;
      new.completed_by = old.completed_by;
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' or old.is_done then
    new.completed_at = null;
    new.completed_by = null;
  else
    new.completed_at = old.completed_at;
    new.completed_by = old.completed_by;
  end if;

  if not new.is_active then
    new.active_by = null;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.active_by = auth.uid();
  elsif new.is_active is distinct from old.is_active
    or new.active_by is distinct from old.active_by then
    new.active_by = auth.uid();
  else
    new.active_by = old.active_by;
  end if;

  return new;
end;
$$;

create or replace function public.assign_todo_item_sort_order()
returns trigger
language plpgsql
as $$
begin
  if new.sort_order > 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.block_id::text, 0));
  select coalesce(max(item.sort_order), 0) + 1000
  into new.sort_order
  from public.todo_items as item
  where item.block_id = new.block_id;

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
  source_todo public.todo_blocks%rowtype;
  target_todo public.todo_blocks%rowtype;
  source_scope text;
  target_scope text;
  source_project_id uuid;
  target_project_id uuid;
  source_created_by uuid;
  target_created_by uuid;
begin
  if num_nonnulls(new.from_card_id, new.from_todo_block_id) <> 1
    or num_nonnulls(new.to_card_id, new.to_todo_block_id) <> 1 then
    raise exception 'Each link endpoint must reference exactly one board object';
  end if;

  if new.from_card_id is not null then
    select * into source_card from public.cards where id = new.from_card_id;
    source_scope = source_card.board_scope;
    source_project_id = source_card.project_id;
    source_created_by = source_card.created_by;
  else
    select * into source_todo from public.todo_blocks where id = new.from_todo_block_id;
    source_scope = source_todo.board_scope;
    source_project_id = source_todo.project_id;
    source_created_by = source_todo.created_by;
  end if;

  if new.to_card_id is not null then
    select * into target_card from public.cards where id = new.to_card_id;
    target_scope = target_card.board_scope;
    target_project_id = target_card.project_id;
    target_created_by = target_card.created_by;
  else
    select * into target_todo from public.todo_blocks where id = new.to_todo_block_id;
    target_scope = target_todo.board_scope;
    target_project_id = target_todo.project_id;
    target_created_by = target_todo.created_by;
  end if;

  if source_scope is null or target_scope is null then
    raise exception 'Linked board objects were not found';
  end if;

  if (new.from_card_id is not null and new.from_card_id = new.to_card_id)
    or (new.from_todo_block_id is not null and new.from_todo_block_id = new.to_todo_block_id) then
    raise exception 'A board object cannot be linked to itself';
  end if;

  if source_scope <> target_scope then
    raise exception 'Objects from different board scopes cannot be linked';
  end if;

  if source_scope = 'shared' then
    if source_project_id is distinct from target_project_id then
      raise exception 'Objects from different projects cannot be linked';
    end if;

    new.board_scope = 'shared';
    new.project_id = source_project_id;
    return new;
  end if;

  if source_created_by is distinct from auth.uid()
    or target_created_by is distinct from auth.uid() then
    raise exception 'Personal links can only connect your own objects';
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
  new.created_at = old.created_at;
  return new;
end;
$$;

create or replace function public.protect_board_text_ownership()
returns trigger
language plpgsql
as $$
begin
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  new.board_scope = old.board_scope;
  new.project_id = old.project_id;
  return new;
end;
$$;

create or replace function public.protect_project_ownership()
returns trigger
language plpgsql
as $$
begin
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  return new;
end;
$$;

create or replace function public.queue_card_image_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cleanup_path text;
  cleanup_user uuid;
begin
  if tg_op = 'UPDATE' and old.image_path is not distinct from new.image_path then
    return new;
  end if;

  cleanup_path = old.image_path;
  cleanup_user = coalesce(auth.uid(), old.created_by);

  if cleanup_path is not null and cleanup_user is not null then
    insert into public.card_image_cleanup_queue (image_path, requested_by)
    values (cleanup_path, cleanup_user)
    on conflict (image_path) do update
    set
      requested_by = excluded.requested_by,
      created_at = now();
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.queue_todo_image_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cleanup_path text;
  cleanup_user uuid;
begin
  if tg_op = 'UPDATE' and old.image_path is not distinct from new.image_path then
    return new;
  end if;

  cleanup_path = old.image_path;
  cleanup_user = coalesce(auth.uid(), old.created_by);

  if cleanup_path is not null and cleanup_user is not null then
    insert into public.todo_image_cleanup_queue (image_path, requested_by)
    values (cleanup_path, cleanup_user)
    on conflict (image_path) do update
    set
      requested_by = excluded.requested_by,
      created_at = now();
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_cards_ownership on public.cards;
create trigger protect_cards_ownership
before update on public.cards
for each row
execute function public.protect_card_ownership();

drop trigger if exists normalize_cards_state on public.cards;
create trigger normalize_cards_state
before insert or update on public.cards
for each row
execute function public.normalize_card_state();

drop trigger if exists protect_todo_blocks_ownership on public.todo_blocks;
create trigger protect_todo_blocks_ownership
before update on public.todo_blocks
for each row
execute function public.protect_todo_block_ownership();

drop trigger if exists protect_todo_items_ownership on public.todo_items;
create trigger protect_todo_items_ownership
before update on public.todo_items
for each row
execute function public.protect_todo_item_ownership();

drop trigger if exists assign_todo_items_sort_order on public.todo_items;
create trigger assign_todo_items_sort_order
before insert on public.todo_items
for each row
execute function public.assign_todo_item_sort_order();

drop trigger if exists normalize_todo_items_state on public.todo_items;
create trigger normalize_todo_items_state
before insert or update on public.todo_items
for each row
execute function public.normalize_todo_item_state();

drop trigger if exists protect_profiles_identity on public.profiles;
create trigger protect_profiles_identity
before update on public.profiles
for each row
execute function public.protect_profile_identity();

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

drop trigger if exists protect_projects_ownership on public.projects;
create trigger protect_projects_ownership
before update on public.projects
for each row
execute function public.protect_project_ownership();

drop trigger if exists queue_replaced_card_image on public.cards;
create trigger queue_replaced_card_image
after update of image_path on public.cards
for each row
execute function public.queue_card_image_cleanup();

drop trigger if exists queue_deleted_card_image on public.cards;
create trigger queue_deleted_card_image
after delete on public.cards
for each row
execute function public.queue_card_image_cleanup();

drop trigger if exists queue_replaced_todo_image on public.todo_items;
create trigger queue_replaced_todo_image
after update of image_path on public.todo_items
for each row
execute function public.queue_todo_image_cleanup();

drop trigger if exists queue_deleted_todo_image on public.todo_items;
create trigger queue_deleted_todo_image
after delete on public.todo_items
for each row
execute function public.queue_todo_image_cleanup();

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

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_cards_updated_at on public.cards;
create trigger set_cards_updated_at
before update on public.cards
for each row
execute function public.set_updated_at();

drop trigger if exists set_todo_blocks_updated_at on public.todo_blocks;
create trigger set_todo_blocks_updated_at
before update on public.todo_blocks
for each row
execute function public.set_updated_at();

drop trigger if exists set_todo_items_updated_at on public.todo_items;
create trigger set_todo_items_updated_at
before update on public.todo_items
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

create or replace function public.update_card_positions(payload jsonb)
returns setof public.cards
language plpgsql
set search_path = public, pg_temp
as $$
declare
  payload_count integer;
  distinct_count integer;
  matched_count integer;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Card position payload must be a JSON array';
  end if;

  select count(*), count(distinct item.id)
  into payload_count, distinct_count
  from jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision);

  if payload_count = 0 then
    return;
  end if;

  if payload_count <> distinct_count or exists (
    select 1
    from jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision)
    where item.id is null
      or item.x is null
      or item.y is null
      or item.x not between -10000000 and 10000000
      or item.y not between -10000000 and 10000000
  ) then
    raise exception 'Card position payload is invalid';
  end if;

  perform card.id
  from public.cards as card
  join jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision)
    on item.id = card.id
  order by card.id
  for update of card;

  get diagnostics matched_count = row_count;

  if matched_count <> payload_count then
    raise exception 'One or more cards were not found or are not accessible';
  end if;

  update public.cards as card
  set
    x = item.x,
    y = item.y
  from jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision)
  where card.id = item.id;

  return query
  select card.*
  from public.cards as card
  join jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision)
    on item.id = card.id
  order by card.created_at, card.id;
end;
$$;

create or replace function public.update_card_geometries(payload jsonb)
returns setof public.cards
language plpgsql
set search_path = public, pg_temp
as $$
declare
  payload_count integer;
  distinct_count integer;
  matched_count integer;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Card geometry payload must be a JSON array';
  end if;

  select count(*), count(distinct item.id)
  into payload_count, distinct_count
  from jsonb_to_recordset(payload) as item(
    id uuid,
    x double precision,
    y double precision,
    w double precision,
    h double precision
  );

  if payload_count = 0 then
    return;
  end if;

  if payload_count <> distinct_count or exists (
    select 1
    from jsonb_to_recordset(payload) as item(
      id uuid,
      x double precision,
      y double precision,
      w double precision,
      h double precision
    )
    where item.id is null
      or item.x is null
      or item.y is null
      or item.w is null
      or item.h is null
      or item.x not between -10000000 and 10000000
      or item.y not between -10000000 and 10000000
      or item.w not between 280 and 3200
      or item.h not between 120 and 6000
  ) then
    raise exception 'Card geometry payload is invalid';
  end if;

  perform card.id
  from public.cards as card
  join jsonb_to_recordset(payload) as item(
    id uuid,
    x double precision,
    y double precision,
    w double precision,
    h double precision
  ) on item.id = card.id
  order by card.id
  for update of card;

  get diagnostics matched_count = row_count;

  if matched_count <> payload_count then
    raise exception 'One or more cards were not found or are not accessible';
  end if;

  update public.cards as card
  set
    x = item.x,
    y = item.y,
    w = item.w,
    h = item.h
  from jsonb_to_recordset(payload) as item(
    id uuid,
    x double precision,
    y double precision,
    w double precision,
    h double precision
  )
  where card.id = item.id;

  return query
  select card.*
  from public.cards as card
  join jsonb_to_recordset(payload) as item(
    id uuid,
    x double precision,
    y double precision,
    w double precision,
    h double precision
  ) on item.id = card.id
  order by card.created_at, card.id;
end;
$$;

create or replace function public.reorder_projects(payload jsonb)
returns setof public.projects
language plpgsql
set search_path = public, pg_temp
as $$
declare
  payload_count integer;
  distinct_count integer;
  matched_count integer;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Project order payload must be a JSON array';
  end if;

  select count(*), count(distinct item.id)
  into payload_count, distinct_count
  from jsonb_to_recordset(payload) as item(id uuid, sort_order integer);

  if payload_count = 0 then
    return query
    select project.* from public.projects as project order by project.sort_order, project.created_at;
    return;
  end if;

  if payload_count <> distinct_count or exists (
    select 1
    from jsonb_to_recordset(payload) as item(id uuid, sort_order integer)
    where item.id is null
      or item.id = '00000000-0000-0000-0000-000000000001'
      or item.sort_order is null
      or item.sort_order not between 1 and 1000000000
  ) then
    raise exception 'Project order payload is invalid';
  end if;

  perform project.id
  from public.projects as project
  join jsonb_to_recordset(payload) as item(id uuid, sort_order integer)
    on item.id = project.id
  order by project.id
  for update of project;

  get diagnostics matched_count = row_count;

  if matched_count <> payload_count then
    raise exception 'One or more projects were not found or are not accessible';
  end if;

  update public.projects as project
  set sort_order = item.sort_order
  from jsonb_to_recordset(payload) as item(id uuid, sort_order integer)
  where project.id = item.id;

  return query
  select project.*
  from public.projects as project
  order by project.sort_order, project.created_at, project.id;
end;
$$;

create or replace function public.update_todo_block_positions(payload jsonb)
returns setof public.todo_blocks
language plpgsql
set search_path = public, pg_temp
as $$
declare
  payload_count integer;
  distinct_count integer;
  matched_count integer;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'To-do position payload must be a JSON array';
  end if;

  select count(*), count(distinct item.id)
  into payload_count, distinct_count
  from jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision);

  if payload_count = 0 then
    return;
  end if;

  if payload_count <> distinct_count or exists (
    select 1
    from jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision)
    where item.id is null
      or item.x is null
      or item.y is null
      or item.x not between -10000000 and 10000000
      or item.y not between -10000000 and 10000000
  ) then
    raise exception 'To-do position payload is invalid';
  end if;

  perform block.id
  from public.todo_blocks as block
  join jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision)
    on item.id = block.id
  order by block.id
  for update of block;

  get diagnostics matched_count = row_count;

  if matched_count <> payload_count then
    raise exception 'One or more To-do blocks were not found or are not accessible';
  end if;

  update public.todo_blocks as block
  set x = item.x, y = item.y
  from jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision)
  where block.id = item.id;

  return query
  select block.*
  from public.todo_blocks as block
  join jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision)
    on item.id = block.id
  order by block.created_at, block.id;
end;
$$;

create or replace function public.update_todo_block_geometries(payload jsonb)
returns setof public.todo_blocks
language plpgsql
set search_path = public, pg_temp
as $$
declare
  payload_count integer;
  distinct_count integer;
  matched_count integer;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'To-do geometry payload must be a JSON array';
  end if;

  select count(*), count(distinct item.id)
  into payload_count, distinct_count
  from jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision, w double precision);

  if payload_count = 0 then
    return;
  end if;

  if payload_count <> distinct_count or exists (
    select 1
    from jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision, w double precision)
    where item.id is null
      or item.x is null
      or item.y is null
      or item.w is null
      or item.x not between -10000000 and 10000000
      or item.y not between -10000000 and 10000000
      or item.w not between 320 and 1600
  ) then
    raise exception 'To-do geometry payload is invalid';
  end if;

  perform block.id
  from public.todo_blocks as block
  join jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision, w double precision)
    on item.id = block.id
  order by block.id
  for update of block;

  get diagnostics matched_count = row_count;

  if matched_count <> payload_count then
    raise exception 'One or more To-do blocks were not found or are not accessible';
  end if;

  update public.todo_blocks as block
  set x = item.x, y = item.y, w = item.w
  from jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision, w double precision)
  where block.id = item.id;

  return query
  select block.*
  from public.todo_blocks as block
  join jsonb_to_recordset(payload) as item(id uuid, x double precision, y double precision, w double precision)
    on item.id = block.id
  order by block.created_at, block.id;
end;
$$;

create or replace function public.reorder_todo_items(target_block_id uuid, payload jsonb)
returns setof public.todo_items
language plpgsql
set search_path = public, pg_temp
as $$
declare
  payload_count integer;
  distinct_count integer;
  matched_count integer;
begin
  if target_block_id is null or payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'To-do item order payload is invalid';
  end if;

  select count(*), count(distinct item.id)
  into payload_count, distinct_count
  from jsonb_to_recordset(payload) as item(id uuid, sort_order integer);

  if payload_count = 0 or payload_count <> distinct_count or exists (
    select 1
    from jsonb_to_recordset(payload) as item(id uuid, sort_order integer)
    where item.id is null
      or item.sort_order is null
      or item.sort_order not between 1 and 1000000000
  ) then
    raise exception 'To-do item order payload is invalid';
  end if;

  perform item.id
  from public.todo_items as item
  join jsonb_to_recordset(payload) as ordered(id uuid, sort_order integer)
    on ordered.id = item.id
  where item.block_id = target_block_id
  order by item.id
  for update of item;

  get diagnostics matched_count = row_count;

  if matched_count <> payload_count then
    raise exception 'One or more To-do items were not found or belong to another block';
  end if;

  update public.todo_items as item
  set sort_order = ordered.sort_order
  from jsonb_to_recordset(payload) as ordered(id uuid, sort_order integer)
  where item.id = ordered.id and item.block_id = target_block_id;

  return query
  select item.*
  from public.todo_items as item
  where item.block_id = target_block_id
  order by item.sort_order, item.created_at, item.id;
end;
$$;

revoke all on function public.update_card_positions(jsonb) from public;
revoke all on function public.update_card_geometries(jsonb) from public;
revoke all on function public.reorder_projects(jsonb) from public;
revoke all on function public.update_todo_block_positions(jsonb) from public;
revoke all on function public.update_todo_block_geometries(jsonb) from public;
revoke all on function public.reorder_todo_items(uuid, jsonb) from public;
grant execute on function public.update_card_positions(jsonb) to authenticated;
grant execute on function public.update_card_geometries(jsonb) to authenticated;
grant execute on function public.reorder_projects(jsonb) to authenticated;
grant execute on function public.update_todo_block_positions(jsonb) to authenticated;
grant execute on function public.update_todo_block_geometries(jsonb) to authenticated;
grant execute on function public.reorder_todo_items(uuid, jsonb) to authenticated;

drop trigger if exists log_cards_activity on public.cards;
drop trigger if exists log_projects_activity on public.projects;
drop trigger if exists log_card_links_activity on public.card_links;

drop function if exists public.log_card_activity() cascade;
drop function if exists public.log_project_activity() cascade;
drop function if exists public.log_card_link_activity() cascade;
drop function if exists public.get_activity_actor_label() cascade;
drop table if exists public.activity_events cascade;

alter table public.projects enable row level security;
alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.todo_blocks enable row level security;
alter table public.todo_items enable row level security;
alter table public.card_links enable row level security;
alter table public.board_texts enable row level security;
alter table public.card_image_cleanup_queue enable row level security;
alter table public.todo_image_cleanup_queue enable row level security;

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

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

revoke all on table public.profiles from anon;
revoke delete on table public.profiles from authenticated;
grant select, insert, update on table public.profiles to authenticated;

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

drop policy if exists "todo_blocks_select_authenticated" on public.todo_blocks;
create policy "todo_blocks_select_authenticated"
on public.todo_blocks
for select
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()));

drop policy if exists "todo_blocks_insert_authenticated" on public.todo_blocks;
create policy "todo_blocks_insert_authenticated"
on public.todo_blocks
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    (board_scope = 'personal' and project_id is null)
    or (board_scope = 'shared' and project_id is not null)
  )
);

drop policy if exists "todo_blocks_update_authenticated" on public.todo_blocks;
create policy "todo_blocks_update_authenticated"
on public.todo_blocks
for update
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()))
with check (
  (board_scope = 'shared' and project_id is not null)
  or (board_scope = 'personal' and created_by = auth.uid() and project_id is null)
);

drop policy if exists "todo_blocks_delete_authenticated" on public.todo_blocks;
create policy "todo_blocks_delete_authenticated"
on public.todo_blocks
for delete
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()));

drop policy if exists "todo_items_select_authenticated" on public.todo_items;
create policy "todo_items_select_authenticated"
on public.todo_items
for select
to authenticated
using (
  exists (
    select 1
    from public.todo_blocks as block
    where block.id = todo_items.block_id
      and (block.board_scope = 'shared' or block.created_by = auth.uid())
  )
);

drop policy if exists "todo_items_insert_authenticated" on public.todo_items;
create policy "todo_items_insert_authenticated"
on public.todo_items
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.todo_blocks as block
    where block.id = todo_items.block_id
      and (block.board_scope = 'shared' or block.created_by = auth.uid())
  )
);

drop policy if exists "todo_items_update_authenticated" on public.todo_items;
create policy "todo_items_update_authenticated"
on public.todo_items
for update
to authenticated
using (
  exists (
    select 1
    from public.todo_blocks as block
    where block.id = todo_items.block_id
      and (block.board_scope = 'shared' or block.created_by = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.todo_blocks as block
    where block.id = todo_items.block_id
      and (block.board_scope = 'shared' or block.created_by = auth.uid())
  )
);

drop policy if exists "todo_items_delete_authenticated" on public.todo_items;
create policy "todo_items_delete_authenticated"
on public.todo_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.todo_blocks as block
    where block.id = todo_items.block_id
      and (block.board_scope = 'shared' or block.created_by = auth.uid())
  )
);

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

drop policy if exists "card_image_cleanup_select_own" on public.card_image_cleanup_queue;
create policy "card_image_cleanup_select_own"
on public.card_image_cleanup_queue
for select
to authenticated
using (requested_by = auth.uid());

drop policy if exists "card_image_cleanup_delete_own" on public.card_image_cleanup_queue;
create policy "card_image_cleanup_delete_own"
on public.card_image_cleanup_queue
for delete
to authenticated
using (requested_by = auth.uid());

revoke all on table public.card_image_cleanup_queue from anon;
grant select, delete on table public.card_image_cleanup_queue to authenticated;

drop policy if exists "todo_image_cleanup_select_own" on public.todo_image_cleanup_queue;
create policy "todo_image_cleanup_select_own"
on public.todo_image_cleanup_queue
for select
to authenticated
using (requested_by = auth.uid());

drop policy if exists "todo_image_cleanup_delete_own" on public.todo_image_cleanup_queue;
create policy "todo_image_cleanup_delete_own"
on public.todo_image_cleanup_queue
for delete
to authenticated
using (requested_by = auth.uid());

revoke all on table public.todo_image_cleanup_queue from anon;
grant select, delete on table public.todo_image_cleanup_queue to authenticated;

drop policy if exists "card_images_select_authenticated" on storage.objects;
create policy "card_images_select_authenticated"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'card-images'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or exists (
      select 1
      from public.cards
      where public.cards.image_path = storage.objects.name
        and (
          public.cards.board_scope = 'shared'
          or (public.cards.board_scope = 'personal' and public.cards.created_by = auth.uid())
        )
    )
    or exists (
      select 1
      from public.card_image_cleanup_queue
      where public.card_image_cleanup_queue.image_path = storage.objects.name
        and public.card_image_cleanup_queue.requested_by = auth.uid()
    )
  )
);

drop policy if exists "card_images_insert_own_folder" on storage.objects;
create policy "card_images_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'card-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(name) like '%.webp'
);

drop policy if exists "card_images_delete_visible_or_own" on storage.objects;
create policy "card_images_delete_visible_or_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'card-images'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or exists (
      select 1
      from public.cards
      where public.cards.image_path = storage.objects.name
        and (
          public.cards.board_scope = 'shared'
          or (public.cards.board_scope = 'personal' and public.cards.created_by = auth.uid())
        )
    )
    or exists (
      select 1
      from public.card_image_cleanup_queue
      where public.card_image_cleanup_queue.image_path = storage.objects.name
        and public.card_image_cleanup_queue.requested_by = auth.uid()
    )
  )
);

drop policy if exists "todo_images_select_authenticated" on storage.objects;
create policy "todo_images_select_authenticated"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'todo-images'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or exists (
      select 1
      from public.todo_items
      join public.todo_blocks on public.todo_blocks.id = public.todo_items.block_id
      where public.todo_items.image_path = storage.objects.name
        and (
          public.todo_blocks.board_scope = 'shared'
          or public.todo_blocks.created_by = auth.uid()
        )
    )
    or exists (
      select 1
      from public.todo_image_cleanup_queue
      where public.todo_image_cleanup_queue.image_path = storage.objects.name
        and public.todo_image_cleanup_queue.requested_by = auth.uid()
    )
  )
);

drop policy if exists "todo_images_insert_own_folder" on storage.objects;
create policy "todo_images_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'todo-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(name) like '%.webp'
);

drop policy if exists "todo_images_delete_visible_or_own" on storage.objects;
create policy "todo_images_delete_visible_or_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'todo-images'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or exists (
      select 1
      from public.todo_items
      join public.todo_blocks on public.todo_blocks.id = public.todo_items.block_id
      where public.todo_items.image_path = storage.objects.name
        and (
          public.todo_blocks.board_scope = 'shared'
          or public.todo_blocks.created_by = auth.uid()
        )
    )
    or exists (
      select 1
      from public.todo_image_cleanup_queue
      where public.todo_image_cleanup_queue.image_path = storage.objects.name
        and public.todo_image_cleanup_queue.requested_by = auth.uid()
    )
  )
);

drop policy if exists "avatars_select_authenticated" on storage.objects;
create policy "avatars_select_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(name) like '%.webp'
);

drop policy if exists "avatars_delete_own_folder" on storage.objects;
create policy "avatars_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

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
  alter publication supabase_realtime add table public.profiles;
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
  alter publication supabase_realtime add table public.todo_blocks;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.todo_items;
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
