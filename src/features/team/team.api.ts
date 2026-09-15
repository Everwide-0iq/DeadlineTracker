import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireSupabase } from '../../lib/supabase.ts'
import type {
  AssignableTeamRole,
  ProjectAccessLevel,
  ProjectMember,
  Team,
  TeamAccess,
  TeamInvite,
  TeamMember,
  TeamRole,
} from './team.types.ts'

type TeamRow = {
  id: string
  name: string
  created_by: string | null
  created_at: string
  updated_at: string
}

type TeamMemberRow = {
  team_id: string
  user_id: string
  role: TeamRole
  joined_at: string
  updated_at: string
}

type ProjectMemberRow = {
  project_id: string
  user_id: string
  access_level: ProjectAccessLevel
  granted_by: string | null
  created_at: string
  updated_at: string
}

type TeamInviteRow = {
  id: string
  team_id: string
  invitee_email: string
  role: AssignableTeamRole
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
  revoked_at: string | null
  created_by: string | null
}

const mapTeam = (row: TeamRow): Team => ({
  id: row.id,
  name: row.name,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapTeamMember = (row: TeamMemberRow): TeamMember => ({
  teamId: row.team_id,
  userId: row.user_id,
  role: row.role,
  joinedAt: row.joined_at,
  updatedAt: row.updated_at,
})

const mapProjectMember = (row: ProjectMemberRow): ProjectMember => ({
  projectId: row.project_id,
  userId: row.user_id,
  accessLevel: row.access_level,
  grantedBy: row.granted_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export async function fetchMyTeamAccess(userId: string): Promise<TeamAccess> {
  const supabase = requireSupabase()
  const { data: membership, error: membershipError } = await supabase
    .from('team_members')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (membershipError) throw membershipError
  if (!membership) return { member: null, projectAccess: {}, team: null }

  const member = mapTeamMember(membership)
  const [{ data: team, error: teamError }, { data: projectMemberships, error: projectMembershipsError }] = await Promise.all([
    supabase.from('teams').select('*').eq('id', member.teamId).single(),
    supabase.from('project_members').select('*').eq('user_id', userId),
  ])

  if (teamError) throw teamError
  if (projectMembershipsError) throw projectMembershipsError

  return {
    member,
    projectAccess: Object.fromEntries(
      (projectMemberships ?? []).map((projectMember) => {
        const mapped = mapProjectMember(projectMember)
        return [mapped.projectId, mapped.accessLevel]
      }),
    ),
    team: mapTeam(team),
  }
}

export async function fetchTeamMembers(teamId: string) {
  const { data, error } = await requireSupabase()
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .order('joined_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapTeamMember)
}

export async function fetchProjectMembers(projectIds: string[]) {
  if (projectIds.length === 0) return []

  const { data, error } = await requireSupabase()
    .from('project_members')
    .select('*')
    .in('project_id', projectIds)

  if (error) throw error
  return (data ?? []).map(mapProjectMember)
}

export async function fetchTeamInvites(teamId: string): Promise<TeamInvite[]> {
  const supabase = requireSupabase()
  const { data: invites, error } = await supabase
    .from('team_invites')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!invites?.length) return []

  const inviteIds = invites.map((invite) => invite.id)
  const { data: links, error: linksError } = await supabase
    .from('team_invite_projects')
    .select('*')
    .in('invite_id', inviteIds)

  if (linksError) throw linksError
  const projectIdsByInvite = new Map<string, string[]>()
  for (const link of links ?? []) {
    const current = projectIdsByInvite.get(link.invite_id) ?? []
    current.push(link.project_id)
    projectIdsByInvite.set(link.invite_id, current)
  }

  return invites.map((invite: TeamInviteRow) => ({
    id: invite.id,
    teamId: invite.team_id,
    email: invite.invitee_email,
    role: invite.role,
    expiresAt: invite.expires_at,
    acceptedAt: invite.accepted_at,
    acceptedBy: invite.accepted_by,
    revokedAt: invite.revoked_at,
    createdBy: invite.created_by,
    projectIds: projectIdsByInvite.get(invite.id) ?? [],
  }))
}

export async function createTeamInvite(input: {
  email: string
  projectIds: string[]
  role: AssignableTeamRole
  teamId: string
}) {
  const { data, error } = await requireSupabase().rpc('create_team_invite', {
    selected_project_ids: input.projectIds,
    target_email: input.email,
    target_role: input.role,
    target_team_id: input.teamId,
  })

  if (error) throw error
  const invite = data?.[0]
  if (!invite) throw new Error('The invitation could not be created.')
  return invite
}

export async function acceptTeamInvite(rawToken: string) {
  const { data, error } = await requireSupabase().rpc('accept_team_invite', { raw_token: rawToken })
  if (error) throw error
  const result = data?.[0]
  if (!result) throw new Error('The invitation could not be accepted.')
  return result
}

export async function updateTeamMemberAccess(input: {
  projectIds: string[]
  role: AssignableTeamRole
  teamId: string
  userId: string
}) {
  const { error } = await requireSupabase().rpc('update_team_member_access', {
    selected_project_ids: input.projectIds,
    target_role: input.role,
    target_team_id: input.teamId,
    target_user_id: input.userId,
  })
  if (error) throw error
}

export async function removeTeamMember(teamId: string, userId: string) {
  const { error } = await requireSupabase().rpc('remove_team_member', {
    target_team_id: teamId,
    target_user_id: userId,
  })
  if (error) throw error
}

export async function revokeTeamInvite(inviteId: string) {
  const { error } = await requireSupabase().rpc('revoke_team_invite', { target_invite_id: inviteId })
  if (error) throw error
}

export function subscribeToMyTeamMembership(userId: string, onChanged: () => void) {
  const channel = requireSupabase()
    .channel(`fireboard:team-membership:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', filter: `user_id=eq.${userId}`, schema: 'public', table: 'team_members' },
      (_payload: RealtimePostgresChangesPayload<TeamMemberRow>) => onChanged(),
    )
    .on(
      'postgres_changes',
      { event: '*', filter: `user_id=eq.${userId}`, schema: 'public', table: 'project_members' },
      () => onChanged(),
    )
    .subscribe(status => { if (status === 'SUBSCRIBED') onChanged() })

  let lastCheck = 0
  const revalidate = () => {
    if (document.hidden || Date.now() - lastCheck < 10000) return
    lastCheck = Date.now()
    onChanged()
  }
  window.addEventListener('focus', revalidate)
  document.addEventListener('visibilitychange', revalidate)

  return () => {
    window.removeEventListener('focus', revalidate)
    document.removeEventListener('visibilitychange', revalidate)
    void requireSupabase().removeChannel(channel)
  }
}

export function subscribeToTeamMembers(teamId: string, onChanged: () => void) {
  const client = requireSupabase()
  const channel = client.channel(`fireboard:team-settings:${teamId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members', filter: `team_id=eq.${teamId}` }, onChanged)
    .subscribe()
  return () => { void client.removeChannel(channel) }
}
