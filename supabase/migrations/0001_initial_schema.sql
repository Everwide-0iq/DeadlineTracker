begin;

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

do $$
begin
  if not exists (
    select 1
    from public.projects
    where id = '00000000-0000-0000-0000-000000000001'
  ) then
    insert into public.projects (id, name, color, sort_order, created_by)
    values ('00000000-0000-0000-0000-000000000001', 'Общее', '#ff463d', 0, null);
  end if;
end;
$$;

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
  deadline_at timestamptz,
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

alter table public.cards
alter column deadline_at drop not null;

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
  and (deadline_at is null or isfinite(deadline_at))
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

-- Team access control. The helpers live in a private schema so they are not
-- exposed through the Data API; public RPCs below are the only mutation entry points.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_name_check check (char_length(btrim(name)) between 1 and 64)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'member', 'viewer')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

alter table public.projects
add column if not exists team_id uuid references public.teams(id) on delete cascade;

with initial_owner as (
  select coalesce(
    (
      select project.created_by
      from public.projects as project
      where project.created_by is not null
      order by project.created_at, project.id
      limit 1
    ),
    (
      select card.created_by
      from public.cards as card
      where card.created_by is not null
      order by card.created_at, card.id
      limit 1
    ),
    (
      select profile.id
      from public.profiles as profile
      order by profile.created_at, profile.id
      limit 1
    )
  ) as user_id
)
insert into public.teams (id, name, created_by)
select '00000000-0000-0000-0000-000000000010', 'Fireboard', initial_owner.user_id
from initial_owner
on conflict (id) do update
set
  created_by = coalesce(public.teams.created_by, excluded.created_by);

update public.projects
set team_id = '00000000-0000-0000-0000-000000000010'
where team_id is null;

alter table public.projects
alter column team_id set not null;

update public.projects
set name = 'Центр'
where id = '00000000-0000-0000-0000-000000000001';

insert into public.team_members (team_id, user_id, role)
select team.id, team.created_by, 'owner'
from public.teams as team
where team.id = '00000000-0000-0000-0000-000000000010'
  and team.created_by is not null
on conflict (team_id, user_id) do update
set role = 'owner';

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_level text not null check (access_level in ('editor', 'contributor', 'viewer')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  invitee_email text not null,
  role text not null check (role in ('admin', 'editor', 'member', 'viewer')),
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint team_invites_email_check check (
    invitee_email = lower(btrim(invitee_email))
    and invitee_email ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
  ),
  constraint team_invites_expiry_check check (expires_at > created_at)
);

create table if not exists public.team_invite_projects (
  invite_id uuid not null references public.team_invites(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  primary key (invite_id, project_id)
);

create index if not exists projects_team_id_idx on public.projects (team_id);
create index if not exists team_members_user_id_idx on public.team_members (user_id, team_id);
create index if not exists project_members_user_id_idx on public.project_members (user_id, project_id);
create index if not exists team_invites_team_email_idx on public.team_invites (team_id, invitee_email)
where accepted_at is null and revoked_at is null;
create index if not exists team_invites_expires_at_idx on public.team_invites (expires_at)
where accepted_at is null and revoked_at is null;

create or replace function private.team_role(target_team_id uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select member.role
  from public.team_members as member
  where member.team_id = target_team_id
    and member.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.is_team_member(target_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members as member
    where member.team_id = target_team_id
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_team_admin(target_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(private.team_role(target_team_id) in ('owner', 'admin'), false);
$$;

create or replace function private.is_team_owner(target_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.team_role(target_team_id) = 'owner';
$$;

create or replace function private.default_project_access(member_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case member_role
    when 'viewer' then 'viewer'
    when 'member' then 'contributor'
    else 'editor'
  end;
$$;

create or replace function private.can_view_project(target_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    join public.team_members as member
      on member.team_id = project.team_id
     and member.user_id = (select auth.uid())
    where project.id = target_project_id
      and (
        member.role in ('owner', 'admin')
        or exists (
          select 1
          from public.project_members as project_member
          where project_member.project_id = project.id
            and project_member.user_id = member.user_id
        )
      )
  );
$$;

create or replace function private.can_contribute_project(target_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    join public.team_members as member
      on member.team_id = project.team_id
     and member.user_id = (select auth.uid())
    where project.id = target_project_id
      and (
        member.role in ('owner', 'admin')
        or exists (
          select 1
          from public.project_members as project_member
          where project_member.project_id = project.id
            and project_member.user_id = member.user_id
            and project_member.access_level in ('editor', 'contributor')
        )
      )
  );
$$;

create or replace function private.can_edit_project(target_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    join public.team_members as member
      on member.team_id = project.team_id
     and member.user_id = (select auth.uid())
    where project.id = target_project_id
      and (
        member.role in ('owner', 'admin')
        or exists (
          select 1
          from public.project_members as project_member
          where project_member.project_id = project.id
            and project_member.user_id = member.user_id
            and project_member.access_level = 'editor'
        )
      )
  );
$$;

create or replace function private.can_update_shared_object(target_project_id uuid, object_owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.can_edit_project(target_project_id)
    or (
      object_owner_id = (select auth.uid())
      and private.can_contribute_project(target_project_id)
    );
$$;

create or replace function private.can_delete_shared_object(target_project_id uuid, object_owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    join public.team_members as member
      on member.team_id = project.team_id
     and member.user_id = (select auth.uid())
    where project.id = target_project_id
      and (
        member.role in ('owner', 'admin')
        or (
          object_owner_id = member.user_id
          and exists (
            select 1
            from public.project_members as project_member
            where project_member.project_id = project.id
              and project_member.user_id = member.user_id
              and project_member.access_level in ('editor', 'contributor')
          )
        )
      )
  );
$$;

create or replace function private.can_manage_project(target_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    where project.id = target_project_id
      and private.is_team_admin(project.team_id)
  );
$$;

create or replace function private.can_create_project(target_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(private.team_role(target_team_id) in ('owner', 'admin', 'editor'), false);
$$;

create or replace function private.shares_team_with(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select target_user_id = (select auth.uid())
    or exists (
      select 1
      from public.team_members as own_membership
      join public.team_members as target_membership
        on target_membership.team_id = own_membership.team_id
      where own_membership.user_id = (select auth.uid())
        and target_membership.user_id = target_user_id
    );
$$;

create or replace function private.can_view_todo_item(target_item_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.todo_items as item
    join public.todo_blocks as block on block.id = item.block_id
    where item.id = target_item_id
      and (
        (block.board_scope = 'personal' and block.created_by = (select auth.uid()))
        or (block.board_scope = 'shared' and private.can_view_project(block.project_id))
      )
  );
$$;

create or replace function private.can_contribute_todo_block(target_block_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.todo_blocks as block
    where block.id = target_block_id
      and (
        (block.board_scope = 'personal' and block.created_by = (select auth.uid()))
        or (block.board_scope = 'shared' and private.can_contribute_project(block.project_id))
      )
  );
$$;

create or replace function private.can_update_todo_item(target_item_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.todo_items as item
    join public.todo_blocks as block on block.id = item.block_id
    where item.id = target_item_id
      and (
        (block.board_scope = 'personal' and block.created_by = (select auth.uid()))
        or (
          block.board_scope = 'shared'
          and private.can_update_shared_object(block.project_id, item.created_by)
        )
      )
  );
$$;

create or replace function private.can_delete_todo_item(target_item_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.todo_items as item
    join public.todo_blocks as block on block.id = item.block_id
    where item.id = target_item_id
      and (
        (block.board_scope = 'personal' and block.created_by = (select auth.uid()))
        or (
          block.board_scope = 'shared'
          and private.can_delete_shared_object(block.project_id, item.created_by)
        )
      )
  );
$$;

create or replace function private.replace_project_access(
  target_team_id uuid,
  target_user_id uuid,
  target_role text,
  requested_project_ids uuid[],
  granted_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  center_project_id constant uuid := '00000000-0000-0000-0000-000000000001';
  normalized_project_ids uuid[];
begin
  normalized_project_ids := array(
    select distinct requested.project_id
    from unnest(
      coalesce(requested_project_ids, '{}'::uuid[]) || array[center_project_id]
    ) as requested(project_id)
  );

  if exists (
    select 1
    from unnest(normalized_project_ids) as requested(project_id)
    left join public.projects as project
      on project.id = requested.project_id
     and project.team_id = target_team_id
    where project.id is null
  ) then
    raise exception 'One or more selected projects do not belong to this team';
  end if;

  delete from public.project_members as project_member
  using public.projects as project
  where project_member.project_id = project.id
    and project.team_id = target_team_id
    and project_member.user_id = target_user_id;

  if target_role = 'admin' then
    return;
  end if;

  insert into public.project_members (project_id, user_id, access_level, granted_by)
  select
    requested.project_id,
    target_user_id,
    private.default_project_access(target_role),
    granted_by_user_id
  from unnest(normalized_project_ids) as requested(project_id)
  on conflict (project_id, user_id) do update
  set
    access_level = excluded.access_level,
    granted_by = excluded.granted_by,
    updated_at = now();
end;
$$;

create or replace function public.sync_center_project_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  center_project_id constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if not exists (
    select 1
    from public.projects as project
    where project.id = center_project_id
      and project.team_id = new.team_id
  ) then
    return new;
  end if;

  insert into public.project_members (project_id, user_id, access_level, granted_by)
  values (
    center_project_id,
    new.user_id,
    private.default_project_access(new.role),
    new.user_id
  )
  on conflict (project_id, user_id) do update
  set
    access_level = excluded.access_level,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.grant_project_creator_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id, access_level, granted_by)
    values (new.id, new.created_by, 'editor', new.created_by)
    on conflict (project_id, user_id) do update
    set access_level = 'editor', updated_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.enforce_member_card_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_card_count integer;
begin
  if new.board_scope <> 'shared'
    or not exists (
      select 1
      from public.projects as project
      join public.team_members as member
        on member.team_id = project.team_id
       and member.user_id = (select auth.uid())
      join public.project_members as project_member
        on project_member.project_id = project.id
       and project_member.user_id = member.user_id
      where project.id = new.project_id
        and member.role = 'member'
        and project_member.access_level = 'contributor'
    ) then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.project_id::text || ':' || (select auth.uid())::text, 0)
  );

  select count(*)
  into active_card_count
  from public.cards as card
  where card.board_scope = 'shared'
    and card.project_id = new.project_id
    and card.created_by = (select auth.uid())
    and card.status <> 'done';

  if active_card_count >= 10 then
    raise exception 'The active card limit for this project has been reached';
  end if;

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
  new.team_id = old.team_id;
  return new;
end;
$$;

drop trigger if exists sync_center_project_access_after_membership on public.team_members;
create trigger sync_center_project_access_after_membership
after insert or update of role on public.team_members
for each row
execute function public.sync_center_project_access();

drop trigger if exists grant_project_creator_access_after_insert on public.projects;
create trigger grant_project_creator_access_after_insert
after insert on public.projects
for each row
execute function public.grant_project_creator_access();

drop trigger if exists enforce_member_card_limit_before_insert on public.cards;
create trigger enforce_member_card_limit_before_insert
before insert on public.cards
for each row
execute function public.enforce_member_card_limit();

insert into public.project_members (project_id, user_id, access_level, granted_by)
select
  '00000000-0000-0000-0000-000000000001',
  member.user_id,
  private.default_project_access(member.role),
  member.user_id
from public.team_members as member
where member.team_id = '00000000-0000-0000-0000-000000000010'
on conflict (project_id, user_id) do nothing;

create or replace function public.create_team_invite(
  target_team_id uuid,
  target_email text,
  target_role text,
  selected_project_ids uuid[] default '{}'::uuid[]
)
returns table(invite_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(coalesce(target_email, '')));
  normalized_role text := lower(btrim(coalesce(target_role, '')));
  raw_token text;
  result_invite_id uuid;
  result_expires_at timestamptz := now() + interval '72 hours';
begin
  if not private.is_team_admin(target_team_id) then
    raise exception 'Only the owner or an administrator can create invitations';
  end if;

  if normalized_role not in ('admin', 'editor', 'member', 'viewer') then
    raise exception 'The invitation role is invalid';
  end if;

  if normalized_role = 'admin' and not private.is_team_owner(target_team_id) then
    raise exception 'Only the owner can invite an administrator';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' then
    raise exception 'The invitation email is invalid';
  end if;

  if exists (
    select 1
    from unnest(coalesce(selected_project_ids, '{}'::uuid[])) as requested(project_id)
    left join public.projects as project
      on project.id = requested.project_id
     and project.team_id = target_team_id
    where project.id is null
  ) then
    raise exception 'One or more selected projects do not belong to this team';
  end if;

  -- Serialize replacement invitations for the same person so two concurrent
  -- administrators cannot leave multiple valid one-time links behind.
  perform pg_advisory_xact_lock(hashtextextended(target_team_id::text || ':' || normalized_email, 0));

  update public.team_invites as invite
  set revoked_at = now()
  where invite.team_id = target_team_id
    and invite.invitee_email = normalized_email
    and invite.accepted_at is null
    and invite.revoked_at is null;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.team_invites (
    team_id,
    invitee_email,
    role,
    token_hash,
    created_by,
    expires_at
  )
  values (
    target_team_id,
    normalized_email,
    normalized_role,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    (select auth.uid()),
    result_expires_at
  )
  returning id into result_invite_id;

  insert into public.team_invite_projects (invite_id, project_id)
  select result_invite_id, requested.project_id
  from unnest(coalesce(selected_project_ids, '{}'::uuid[])) as requested(project_id)
  on conflict do nothing;

  return query select result_invite_id, raw_token, result_expires_at;
end;
$$;

create or replace function public.accept_team_invite(raw_token text)
returns table(team_id uuid, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.team_invites%rowtype;
  accepted_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  existing_role text;
  selected_project_ids uuid[];
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to accept an invitation';
  end if;

  if raw_token is null or char_length(raw_token) <> 64 or raw_token !~ '^[0-9a-f]+$' then
    raise exception 'The invitation link is invalid';
  end if;

  select * into invite
  from public.team_invites as candidate
  where candidate.token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
  for update;

  if invite.id is null
    or invite.revoked_at is not null
    or invite.accepted_at is not null
    or invite.expires_at <= now() then
    raise exception 'The invitation link is expired, revoked, or already used';
  end if;

  if accepted_email = '' or invite.invitee_email <> accepted_email then
    raise exception 'This invitation belongs to a different email address';
  end if;

  select member.role into existing_role
  from public.team_members as member
  where member.team_id = invite.team_id
    and member.user_id = (select auth.uid());

  if existing_role = 'owner' then
    raise exception 'The team owner cannot accept another invitation';
  end if;

  if existing_role is not null then
    raise exception 'This account is already a team member. Update its access from team settings.';
  end if;

  select coalesce(array_agg(invite_project.project_id), '{}'::uuid[])
  into selected_project_ids
  from public.team_invite_projects as invite_project
  where invite_project.invite_id = invite.id;

  insert into public.team_members (team_id, user_id, role)
  values (invite.team_id, (select auth.uid()), invite.role);

  perform private.replace_project_access(
    invite.team_id,
    (select auth.uid()),
    invite.role,
    selected_project_ids,
    invite.created_by
  );

  update public.team_invites
  set
    accepted_at = now(),
    accepted_by = (select auth.uid())
  where id = invite.id;

  return query select invite.team_id, invite.role;
end;
$$;

create or replace function public.update_team_member_access(
  target_team_id uuid,
  target_user_id uuid,
  target_role text,
  selected_project_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_role text := private.team_role(target_team_id);
  existing_role text;
  normalized_role text := lower(btrim(coalesce(target_role, '')));
begin
  if current_role not in ('owner', 'admin') then
    raise exception 'Only the owner or an administrator can update team access';
  end if;

  if normalized_role not in ('admin', 'editor', 'member', 'viewer') then
    raise exception 'The team role is invalid';
  end if;

  select member.role into existing_role
  from public.team_members as member
  where member.team_id = target_team_id
    and member.user_id = target_user_id
  for update;

  if existing_role is null then
    raise exception 'The team member was not found';
  end if;

  if existing_role = 'owner' then
    raise exception 'Transfer ownership before changing the owner access';
  end if;

  if current_role <> 'owner' and (existing_role = 'admin' or normalized_role = 'admin') then
    raise exception 'Only the owner can manage administrator access';
  end if;

  update public.team_members
  set role = normalized_role
  where team_id = target_team_id
    and user_id = target_user_id;

  perform private.replace_project_access(
    target_team_id,
    target_user_id,
    normalized_role,
    selected_project_ids,
    (select auth.uid())
  );
end;
$$;

create or replace function public.remove_team_member(target_team_id uuid, target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_role text := private.team_role(target_team_id);
  existing_role text;
begin
  if current_role not in ('owner', 'admin') then
    raise exception 'Only the owner or an administrator can remove a member';
  end if;

  if target_user_id = (select auth.uid()) then
    raise exception 'Use ownership transfer or leave-team flow instead of removing yourself';
  end if;

  select member.role into existing_role
  from public.team_members as member
  where member.team_id = target_team_id
    and member.user_id = target_user_id
  for update;

  if existing_role is null then
    raise exception 'The team member was not found';
  end if;

  if existing_role = 'owner' then
    raise exception 'The owner cannot be removed';
  end if;

  if current_role <> 'owner' and existing_role = 'admin' then
    raise exception 'Only the owner can remove an administrator';
  end if;

  delete from public.team_members
  where team_id = target_team_id
    and user_id = target_user_id;
end;
$$;

create or replace function public.revoke_team_invite(target_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_team_id uuid;
begin
  select invite.team_id into invite_team_id
  from public.team_invites as invite
  where invite.id = target_invite_id
  for update;

  if invite_team_id is null or not private.is_team_admin(invite_team_id) then
    raise exception 'Only the owner or an administrator can revoke this invitation';
  end if;

  update public.team_invites
  set revoked_at = now()
  where id = target_invite_id
    and accepted_at is null
    and revoked_at is null;
end;
$$;

create or replace function public.create_team_project(
  target_team_id uuid,
  project_name text,
  project_color text
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := btrim(coalesce(project_name, ''));
  normalized_color text := lower(btrim(coalesce(project_color, '')));
  next_sort_order integer;
  created_project public.projects%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to create a project';
  end if;

  if not private.can_create_project(target_team_id) then
    raise exception 'You do not have permission to create projects in this team';
  end if;

  if char_length(normalized_name) not between 1 and 64 then
    raise exception 'The project name must contain between 1 and 64 characters';
  end if;

  if normalized_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'The project color is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_team_id::text, 0));

  select coalesce(max(project.sort_order), 0) + 1000
  into next_sort_order
  from public.projects as project
  where project.team_id = target_team_id;

  insert into public.projects (name, color, sort_order, team_id, created_by)
  values (normalized_name, normalized_color, next_sort_order, target_team_id, (select auth.uid()))
  returning * into created_project;

  return created_project;
end;
$$;

revoke all on function public.create_team_invite(uuid, text, text, uuid[]) from public;
revoke all on function public.accept_team_invite(text) from public;
revoke all on function public.update_team_member_access(uuid, uuid, text, uuid[]) from public;
revoke all on function public.remove_team_member(uuid, uuid) from public;
revoke all on function public.revoke_team_invite(uuid) from public;
revoke all on function public.create_team_project(uuid, text, text) from public;
grant execute on function public.create_team_invite(uuid, text, text, uuid[]) to authenticated;
grant execute on function public.accept_team_invite(text) to authenticated;
grant execute on function public.update_team_member_access(uuid, uuid, text, uuid[]) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_team_invite(uuid) to authenticated;
grant execute on function public.create_team_project(uuid, text, text) to authenticated;

revoke all on function private.team_role(uuid) from public;
revoke all on function private.is_team_member(uuid) from public;
revoke all on function private.is_team_admin(uuid) from public;
revoke all on function private.is_team_owner(uuid) from public;
revoke all on function private.default_project_access(text) from public;
revoke all on function private.can_view_project(uuid) from public;
revoke all on function private.can_contribute_project(uuid) from public;
revoke all on function private.can_edit_project(uuid) from public;
revoke all on function private.can_update_shared_object(uuid, uuid) from public;
revoke all on function private.can_delete_shared_object(uuid, uuid) from public;
revoke all on function private.can_manage_project(uuid) from public;
revoke all on function private.can_create_project(uuid) from public;
revoke all on function private.shares_team_with(uuid) from public;
revoke all on function private.can_view_todo_item(uuid) from public;
revoke all on function private.can_contribute_todo_block(uuid) from public;
revoke all on function private.can_update_todo_item(uuid) from public;
revoke all on function private.can_delete_todo_item(uuid) from public;
revoke all on function private.replace_project_access(uuid, uuid, text, uuid[], uuid) from public;
revoke all on function private.team_role(uuid) from authenticated;
revoke all on function private.is_team_member(uuid) from authenticated;
revoke all on function private.is_team_admin(uuid) from authenticated;
revoke all on function private.is_team_owner(uuid) from authenticated;
revoke all on function private.default_project_access(text) from authenticated;
revoke all on function private.can_view_project(uuid) from authenticated;
revoke all on function private.can_contribute_project(uuid) from authenticated;
revoke all on function private.can_edit_project(uuid) from authenticated;
revoke all on function private.can_update_shared_object(uuid, uuid) from authenticated;
revoke all on function private.can_delete_shared_object(uuid, uuid) from authenticated;
revoke all on function private.can_manage_project(uuid) from authenticated;
revoke all on function private.can_create_project(uuid) from authenticated;
revoke all on function private.shares_team_with(uuid) from authenticated;
revoke all on function private.can_view_todo_item(uuid) from authenticated;
revoke all on function private.can_contribute_todo_block(uuid) from authenticated;
revoke all on function private.can_update_todo_item(uuid) from authenticated;
revoke all on function private.can_delete_todo_item(uuid) from authenticated;
revoke all on function private.replace_project_access(uuid, uuid, text, uuid[], uuid) from authenticated;

-- RLS expressions must be able to call these read-only predicates. The only
-- state-changing helper, replace_project_access, deliberately stays private.
grant execute on function private.is_team_member(uuid) to authenticated;
grant execute on function private.is_team_admin(uuid) to authenticated;
grant execute on function private.can_view_project(uuid) to authenticated;
grant execute on function private.can_contribute_project(uuid) to authenticated;
grant execute on function private.can_update_shared_object(uuid, uuid) to authenticated;
grant execute on function private.can_delete_shared_object(uuid, uuid) to authenticated;
grant execute on function private.can_manage_project(uuid) to authenticated;
grant execute on function private.can_create_project(uuid) to authenticated;
grant execute on function private.shares_team_with(uuid) to authenticated;
grant execute on function private.can_view_todo_item(uuid) to authenticated;
grant execute on function private.can_contribute_todo_block(uuid) to authenticated;
grant execute on function private.can_update_todo_item(uuid) to authenticated;
grant execute on function private.can_delete_todo_item(uuid) to authenticated;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.project_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.team_invite_projects enable row level security;

-- A previous interrupted run may have created only part of this access layer.
-- Remove every policy owned by this section before recreating it below.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select *
    from (
      values
        ('public', 'teams', 'teams_select_members'),
        ('public', 'team_members', 'team_members_select_members'),
        ('public', 'project_members', 'project_members_select_self_or_admin'),
        ('public', 'team_invites', 'team_invites_manage_admins'),
        ('public', 'team_invite_projects', 'team_invite_projects_manage_admins'),
        ('public', 'projects', 'projects_select_team_access'),
        ('public', 'projects', 'projects_insert_team_editor'),
        ('public', 'projects', 'projects_update_team_admin'),
        ('public', 'projects', 'projects_delete_team_admin'),
        ('public', 'profiles', 'profiles_select_shared_team'),
        ('public', 'cards', 'cards_select_team_access'),
        ('public', 'cards', 'cards_insert_team_contributors'),
        ('public', 'cards', 'cards_update_team_access'),
        ('public', 'cards', 'cards_delete_team_access'),
        ('public', 'todo_blocks', 'todo_blocks_select_team_access'),
        ('public', 'todo_blocks', 'todo_blocks_insert_team_contributors'),
        ('public', 'todo_blocks', 'todo_blocks_update_team_access'),
        ('public', 'todo_blocks', 'todo_blocks_delete_team_access'),
        ('public', 'todo_items', 'todo_items_select_team_access'),
        ('public', 'todo_items', 'todo_items_insert_team_contributors'),
        ('public', 'todo_items', 'todo_items_update_team_access'),
        ('public', 'todo_items', 'todo_items_delete_team_access'),
        ('public', 'card_links', 'card_links_select_team_access'),
        ('public', 'card_links', 'card_links_insert_team_contributors'),
        ('public', 'card_links', 'card_links_update_team_access'),
        ('public', 'card_links', 'card_links_delete_team_access'),
        ('public', 'board_texts', 'board_texts_select_team_access'),
        ('public', 'board_texts', 'board_texts_insert_team_contributors'),
        ('public', 'board_texts', 'board_texts_update_team_access'),
        ('public', 'board_texts', 'board_texts_delete_team_access'),
        ('storage', 'objects', 'card_images_select_team_access'),
        ('storage', 'objects', 'card_images_delete_team_access'),
        ('storage', 'objects', 'todo_images_select_team_access'),
        ('storage', 'objects', 'todo_images_delete_team_access'),
        ('storage', 'objects', 'avatars_select_shared_team'),
        ('realtime', 'messages', 'fireboard_presence_read'),
        ('realtime', 'messages', 'fireboard_presence_write')
    ) as policies(schema_name, table_name, policy_name)
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name
    );
  end loop;
end;
$$;

drop policy if exists "teams_select_members" on public.teams;
create policy "teams_select_members"
on public.teams
for select
to authenticated
using (private.is_team_member(id));

drop policy if exists "team_members_select_members" on public.team_members;
create policy "team_members_select_members"
on public.team_members
for select
to authenticated
using (private.is_team_member(team_id));

drop policy if exists "project_members_select_self_or_admin" on public.project_members;
create policy "project_members_select_self_or_admin"
on public.project_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.can_manage_project(project_id)
);

drop policy if exists "team_invites_manage_admins" on public.team_invites;
create policy "team_invites_manage_admins"
on public.team_invites
for select
to authenticated
using (private.is_team_admin(team_id));

drop policy if exists "team_invite_projects_manage_admins" on public.team_invite_projects;
create policy "team_invite_projects_manage_admins"
on public.team_invite_projects
for select
to authenticated
using (
  exists (
    select 1
    from public.team_invites as invite
    where invite.id = invite_id
      and private.is_team_admin(invite.team_id)
  )
);

drop policy if exists "projects_select_authenticated" on public.projects;
create policy "projects_select_team_access"
on public.projects
for select
to authenticated
using (private.can_view_project(id));

drop policy if exists "projects_insert_authenticated" on public.projects;
create policy "projects_insert_team_editor"
on public.projects
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and private.can_create_project(team_id)
);

drop policy if exists "projects_update_authenticated" on public.projects;
create policy "projects_update_team_admin"
on public.projects
for update
to authenticated
using (private.can_manage_project(id))
with check (private.can_manage_project(id));

drop policy if exists "projects_delete_authenticated" on public.projects;
create policy "projects_delete_team_admin"
on public.projects
for delete
to authenticated
using (
  id <> '00000000-0000-0000-0000-000000000001'
  and private.can_manage_project(id)
);

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_shared_team"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or private.shares_team_with(id)
);

drop policy if exists "cards_select_authenticated" on public.cards;
create policy "cards_select_team_access"
on public.cards
for select
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_view_project(project_id))
);

drop policy if exists "cards_insert_authenticated" on public.cards;
create policy "cards_insert_team_contributors"
on public.cards
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (board_scope = 'personal' and project_id is null)
    or (board_scope = 'shared' and private.can_contribute_project(project_id))
  )
);

drop policy if exists "cards_update_authenticated" on public.cards;
create policy "cards_update_team_access"
on public.cards
for update
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_update_shared_object(project_id, created_by))
)
with check (
  (board_scope = 'personal' and created_by = (select auth.uid()) and project_id is null)
  or (board_scope = 'shared' and private.can_update_shared_object(project_id, created_by))
);

drop policy if exists "cards_delete_authenticated" on public.cards;
create policy "cards_delete_team_access"
on public.cards
for delete
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_delete_shared_object(project_id, created_by))
);

drop policy if exists "todo_blocks_select_authenticated" on public.todo_blocks;
create policy "todo_blocks_select_team_access"
on public.todo_blocks
for select
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_view_project(project_id))
);

drop policy if exists "todo_blocks_insert_authenticated" on public.todo_blocks;
create policy "todo_blocks_insert_team_contributors"
on public.todo_blocks
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (board_scope = 'personal' and project_id is null)
    or (board_scope = 'shared' and private.can_contribute_project(project_id))
  )
);

drop policy if exists "todo_blocks_update_authenticated" on public.todo_blocks;
create policy "todo_blocks_update_team_access"
on public.todo_blocks
for update
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_update_shared_object(project_id, created_by))
)
with check (
  (board_scope = 'personal' and created_by = (select auth.uid()) and project_id is null)
  or (board_scope = 'shared' and private.can_update_shared_object(project_id, created_by))
);

drop policy if exists "todo_blocks_delete_authenticated" on public.todo_blocks;
create policy "todo_blocks_delete_team_access"
on public.todo_blocks
for delete
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_delete_shared_object(project_id, created_by))
);

drop policy if exists "todo_items_select_authenticated" on public.todo_items;
create policy "todo_items_select_team_access"
on public.todo_items
for select
to authenticated
using (private.can_view_todo_item(id));

drop policy if exists "todo_items_insert_authenticated" on public.todo_items;
create policy "todo_items_insert_team_contributors"
on public.todo_items
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and private.can_contribute_todo_block(block_id)
);

drop policy if exists "todo_items_update_authenticated" on public.todo_items;
create policy "todo_items_update_team_access"
on public.todo_items
for update
to authenticated
using (private.can_update_todo_item(id))
with check (private.can_update_todo_item(id));

drop policy if exists "todo_items_delete_authenticated" on public.todo_items;
create policy "todo_items_delete_team_access"
on public.todo_items
for delete
to authenticated
using (private.can_delete_todo_item(id));

drop policy if exists "card_links_select_authenticated" on public.card_links;
create policy "card_links_select_team_access"
on public.card_links
for select
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_view_project(project_id))
);

drop policy if exists "card_links_insert_authenticated" on public.card_links;
create policy "card_links_insert_team_contributors"
on public.card_links
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (board_scope = 'personal' and project_id is null)
    or (board_scope = 'shared' and private.can_contribute_project(project_id))
  )
);

drop policy if exists "card_links_update_authenticated" on public.card_links;
create policy "card_links_update_team_access"
on public.card_links
for update
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_update_shared_object(project_id, created_by))
)
with check (
  (board_scope = 'personal' and created_by = (select auth.uid()) and project_id is null)
  or (board_scope = 'shared' and private.can_update_shared_object(project_id, created_by))
);

drop policy if exists "card_links_delete_authenticated" on public.card_links;
create policy "card_links_delete_team_access"
on public.card_links
for delete
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_delete_shared_object(project_id, created_by))
);

drop policy if exists "board_texts_select_authenticated" on public.board_texts;
create policy "board_texts_select_team_access"
on public.board_texts
for select
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_view_project(project_id))
);

drop policy if exists "board_texts_insert_authenticated" on public.board_texts;
create policy "board_texts_insert_team_contributors"
on public.board_texts
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (board_scope = 'personal' and project_id is null)
    or (board_scope = 'shared' and private.can_contribute_project(project_id))
  )
);

drop policy if exists "board_texts_update_authenticated" on public.board_texts;
create policy "board_texts_update_team_access"
on public.board_texts
for update
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_update_shared_object(project_id, created_by))
)
with check (
  (board_scope = 'personal' and created_by = (select auth.uid()) and project_id is null)
  or (board_scope = 'shared' and private.can_update_shared_object(project_id, created_by))
);

drop policy if exists "board_texts_delete_authenticated" on public.board_texts;
create policy "board_texts_delete_team_access"
on public.board_texts
for delete
to authenticated
using (
  (board_scope = 'personal' and created_by = (select auth.uid()))
  or (board_scope = 'shared' and private.can_delete_shared_object(project_id, created_by))
);

drop policy if exists "card_images_select_authenticated" on storage.objects;
create policy "card_images_select_team_access"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'card-images'
  and (
    exists (
      select 1
      from public.cards as card
      where card.image_path = name
        and (
          (card.board_scope = 'personal' and card.created_by = (select auth.uid()))
          or (card.board_scope = 'shared' and private.can_view_project(card.project_id))
        )
    )
    or (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      and not exists (select 1 from public.cards as card where card.image_path = name)
    )
  )
);

drop policy if exists "card_images_delete_visible_or_own" on storage.objects;
create policy "card_images_delete_team_access"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'card-images'
  and (
    exists (
      select 1
      from public.cards as card
      where card.image_path = name
        and (
          (card.board_scope = 'personal' and card.created_by = (select auth.uid()))
          or (
            card.board_scope = 'shared'
            and private.can_delete_shared_object(card.project_id, card.created_by)
          )
        )
    )
    or (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      and not exists (select 1 from public.cards as card where card.image_path = name)
    )
    or exists (
      select 1
      from public.card_image_cleanup_queue as cleanup
      where cleanup.image_path = name
        and cleanup.requested_by = (select auth.uid())
    )
  )
);

drop policy if exists "todo_images_select_authenticated" on storage.objects;
create policy "todo_images_select_team_access"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'todo-images'
  and (
    exists (
      select 1
      from public.todo_items as item
      join public.todo_blocks as block on block.id = item.block_id
      where item.image_path = name
        and (
          (block.board_scope = 'personal' and block.created_by = (select auth.uid()))
          or (block.board_scope = 'shared' and private.can_view_project(block.project_id))
        )
    )
    or (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      and not exists (select 1 from public.todo_items as item where item.image_path = name)
    )
  )
);

drop policy if exists "todo_images_delete_visible_or_own" on storage.objects;
create policy "todo_images_delete_team_access"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'todo-images'
  and (
    exists (
      select 1
      from public.todo_items as item
      join public.todo_blocks as block on block.id = item.block_id
      where item.image_path = name
        and (
          (block.board_scope = 'personal' and block.created_by = (select auth.uid()))
          or (
            block.board_scope = 'shared'
            and private.can_delete_shared_object(block.project_id, item.created_by)
          )
        )
    )
    or (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      and not exists (select 1 from public.todo_items as item where item.image_path = name)
    )
    or exists (
      select 1
      from public.todo_image_cleanup_queue as cleanup
      where cleanup.image_path = name
        and cleanup.requested_by = (select auth.uid())
    )
  )
);

drop policy if exists "avatars_select_authenticated" on storage.objects;
create policy "avatars_select_shared_team"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or exists (
      select 1
      from public.profiles as profile
      where profile.avatar_path = name
        and private.shares_team_with(profile.id)
    )
  )
);

create or replace function private.can_access_presence_topic(topic text)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  project_id uuid;
begin
  if topic !~ '^fireboard:presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  project_id := split_part(topic, ':', 3)::uuid;
  return private.can_view_project(project_id);
end;
$$;

revoke all on function private.can_access_presence_topic(text) from public;
grant execute on function private.can_access_presence_topic(text) to authenticated;

drop policy if exists "fireboard_presence_read" on realtime.messages;
create policy "fireboard_presence_read"
on realtime.messages
for select
to authenticated
using (
  private.can_access_presence_topic(realtime.topic())
);

drop policy if exists "fireboard_presence_write" on realtime.messages;
create policy "fireboard_presence_write"
on realtime.messages
for insert
to authenticated
with check (
  private.can_access_presence_topic(realtime.topic())
);

drop trigger if exists set_teams_updated_at on public.teams;
create trigger set_teams_updated_at
before update on public.teams
for each row
execute function public.set_updated_at();

drop trigger if exists set_team_members_updated_at on public.team_members;
create trigger set_team_members_updated_at
before update on public.team_members
for each row
execute function public.set_updated_at();

drop trigger if exists set_project_members_updated_at on public.project_members;
create trigger set_project_members_updated_at
before update on public.project_members
for each row
execute function public.set_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.teams;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.team_members;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.project_members;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

commit;
