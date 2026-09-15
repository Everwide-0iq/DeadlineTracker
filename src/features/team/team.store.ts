import { create } from 'zustand'
import { getCurrentTranslation } from '../i18n/i18n.store.ts'
import { fetchMyTeamAccess, subscribeToMyTeamMembership } from './team.api.ts'
import { teamAccessKey, type ProjectAccessLevel, type Team, type TeamMember, type TeamRole } from './team.types.ts'

type TeamState = {
  accessVersion: number
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

let accessRequest = 0
export const useTeamStore = create<TeamState>((set, get) => ({
  accessVersion: 0,
  error: null,
  hasLoaded: false,
  isLoading: false,
  member: null,
  projectAccess: {},
  team: null,
  clear: () => { accessRequest++; set(state => ({ accessVersion: state.accessVersion + 1, error: null, hasLoaded: false, isLoading: false, member: null, projectAccess: {}, team: null })) },
  loadAccess: async (userId) => {
    const request = ++accessRequest
    set({ error: null, isLoading: true })
    try {
      const access = await fetchMyTeamAccess(userId)
      if (request !== accessRequest) return
      set(state => ({ ...access, accessVersion: state.accessVersion + Number(!state.hasLoaded || teamAccessKey(state) !== teamAccessKey(access)), error: null, hasLoaded: true, isLoading: false }))
    } catch (error) {
      if (request !== accessRequest) return
      set(state => ({ accessVersion: state.accessVersion + Number(!state.hasLoaded), error: getMessage(error), hasLoaded: true, isLoading: false }))
    }
  },
  subscribeRealtime: (userId) =>
    subscribeToMyTeamMembership(userId, () => {
      void get().loadAccess(userId)
    }),
}))

export const getTeamRoleLabel = (role: TeamRole | null) => role ?? 'viewer'
