create extension if not exists pgcrypto;

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  deadline_at timestamptz not null,
  status text not null default 'todo' check (status in ('todo', 'done')),
  board_scope text not null default 'shared' check (board_scope in ('shared', 'personal')),
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
alter column board_scope set default 'shared';

update public.cards
set board_scope = 'shared'
where board_scope is null;

alter table public.cards
alter column board_scope set not null;

do $$
begin
  alter table public.cards
  add constraint cards_board_scope_check check (board_scope in ('shared', 'personal'));
exception
  when duplicate_object then null;
end;
$$;

create index if not exists cards_deadline_at_idx on public.cards (deadline_at);
create index if not exists cards_status_idx on public.cards (status);
create index if not exists cards_created_at_idx on public.cards (created_at);
create index if not exists cards_board_scope_idx on public.cards (board_scope);
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

drop trigger if exists set_cards_updated_at on public.cards;
create trigger set_cards_updated_at
before update on public.cards
for each row
execute function public.set_updated_at();

alter table public.cards enable row level security;

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
  and (board_scope = 'shared' or board_scope = 'personal')
);

drop policy if exists "cards_update_authenticated" on public.cards;
create policy "cards_update_authenticated"
on public.cards
for update
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()))
with check (
  board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid())
);

drop policy if exists "cards_delete_authenticated" on public.cards;
create policy "cards_delete_authenticated"
on public.cards
for delete
to authenticated
using (board_scope = 'shared' or (board_scope = 'personal' and created_by = auth.uid()));

do $$
begin
  alter publication supabase_realtime add table public.cards;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
