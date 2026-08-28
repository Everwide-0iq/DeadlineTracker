import { create } from 'zustand'
import { getCurrentTranslation } from '../i18n/i18n.store.ts'
import { fetchMyTeamAccess, subscribeToMyTeamMembership } from './team.api.ts'
import type { ProjectAccessLevel, Team, TeamMember, TeamRole } from './team.types.ts'

type TeamState = {
  error: string | null
  hasLoaded: boolean
  isLoading: boolean
  member: TeamMember | null
  projectAccess: Record<string, ProjectAccessLevel>
  team: Team | null
  clear: () => void
  loadAccess: (userId: string) => Promise<void>
  subscribeRealtime: (userId: string) => () => void
}

const getMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return getCurrentTranslation().errors.projectsGeneric
}

export const useTeamStore = create<TeamState>((set, get) => ({
  error: null,
  hasLoaded: false,
  isLoading: false,
  member: null,
  projectAccess: {},
  team: null,
  clear: () => set({ error: null, hasLoaded: false, isLoading: false, member: null, projectAccess: {}, team: null }),
  loadAccess: async (userId) => {
    set({ error: null, isLoading: true })
    try {
      const access = await fetchMyTeamAccess(userId)
      set({ ...access, error: null, hasLoaded: true, isLoading: false })
    } catch (error) {
      set({ error: getMessage(error), hasLoaded: true, isLoading: false, member: null, projectAccess: {}, team: null })
    }
  },
  subscribeRealtime: (userId) =>
    subscribeToMyTeamMembership(userId, () => {
      void get().loadAccess(userId)
    }),
}))

export const getTeamRoleLabel = (role: TeamRole | null) => role ?? 'viewer'
