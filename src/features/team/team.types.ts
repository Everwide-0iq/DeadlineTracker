export const teamRoles = ['owner', 'admin', 'editor', 'member', 'viewer'] as const
export const assignableTeamRoles = ['admin', 'editor', 'member', 'viewer'] as const
export const projectAccessLevels = ['viewer', 'contributor', 'editor'] as const

export type TeamRole = (typeof teamRoles)[number]
export type AssignableTeamRole = (typeof assignableTeamRoles)[number]
export type ProjectAccessLevel = (typeof projectAccessLevels)[number]

export type Team = {
  id: string
  name: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type TeamMember = {
  teamId: string
  userId: string
  role: TeamRole
  joinedAt: string
  updatedAt: string
}

export type ProjectMember = {
  projectId: string
  userId: string
  accessLevel: ProjectAccessLevel
  grantedBy: string | null
  createdAt: string
  updatedAt: string
}

export type TeamInvite = {
  id: string
  teamId: string
  email: string
  role: AssignableTeamRole
  expiresAt: string
  acceptedAt: string | null
  acceptedBy: string | null
  revokedAt: string | null
  createdBy: string | null
  projectIds: string[]
}

export type TeamAccess = {
  member: TeamMember | null
  projectAccess: Record<string, ProjectAccessLevel>
  team: Team | null
}

export const isTeamAdmin = (role: TeamRole | null) => role === 'owner' || role === 'admin'
export const canCreateTeamProject = (role: TeamRole | null) =>
  role === 'owner' || role === 'admin' || role === 'editor'

export const canContributeToProject = (
  role: TeamRole | null,
  accessLevel: ProjectAccessLevel | undefined,
) => isTeamAdmin(role) || accessLevel === 'editor' || accessLevel === 'contributor'
