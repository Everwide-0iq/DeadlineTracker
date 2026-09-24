begin;

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
  actor_team_role text := private.team_role(target_team_id);
  existing_role text;
  normalized_role text := lower(btrim(coalesce(target_role, '')));
begin
  if actor_team_role is null or actor_team_role not in ('owner', 'admin') then
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

  if actor_team_role <> 'owner' and (existing_role = 'admin' or normalized_role = 'admin') then
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
  actor_team_role text := private.team_role(target_team_id);
  existing_role text;
begin
  if actor_team_role is null or actor_team_role not in ('owner', 'admin') then
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

  if actor_team_role <> 'owner' and existing_role = 'admin' then
    raise exception 'Only the owner can remove an administrator';
  end if;

  delete from public.team_members
  where team_id = target_team_id
    and user_id = target_user_id;
end;
$$;

notify pgrst, 'reload schema';
commit;

