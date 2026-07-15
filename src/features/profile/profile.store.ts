import { create } from 'zustand'
import { preloadPrivateImage } from '../../lib/usePrivateImage.ts'
import { getCurrentTranslation } from '../i18n/i18n.store.ts'
import {
  ensureProfile,
  fetchProfiles,
  subscribeToProfileChanges,
  updateProfile as updateProfileApi,
} from './profile.api.ts'
import type { UpdateProfileInput, UserProfile } from './profile.types.ts'
import { getAvatarSignedUrl } from './avatar.api.ts'

type ProfileState = {
  error: string | null
  isLoading: boolean
  profiles: Record<string, UserProfile>
  clear: () => void
  loadProfiles: (userId: string, email: string | null) => Promise<void>
  subscribeRealtime: () => () => void
  updateProfile: (userId: string, input: UpdateProfileInput) => Promise<UserProfile>
}

function getMessage(error: unknown) {
  const t = getCurrentTranslation()

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const code = typeof record.code === 'string' ? record.code : null
    const message = typeof record.message === 'string' ? record.message : null

    if (code === 'PGRST205' || message?.includes("Could not find the table 'public.profiles'")) {
      return t.errors.profilesMissingTable
    }

    if (message) {
      return message
    }
  }

  return error instanceof Error ? error.message : t.errors.profileGeneric
}

const toRecord = (profiles: UserProfile[]) =>
  Object.fromEntries(profiles.map((profile) => [profile.id, profile]))

const preloadProfileAvatar = (profile: UserProfile) => {
  if (profile.avatarPath) {
    void preloadPrivateImage(profile.avatarPath, getAvatarSignedUrl).catch(() => undefined)
  }
}

export const useProfileStore = create<ProfileState>((set) => ({
  error: null,
  isLoading: false,
  profiles: {},
  clear: () => set({ error: null, isLoading: false, profiles: {} }),
  loadProfiles: async (userId, email) => {
    set({ error: null, isLoading: true })

    try {
      const profiles = await fetchProfiles()
      let nextProfiles = profiles

      if (!profiles.some((profile) => profile.id === userId)) {
        const profile = await ensureProfile(userId, email)
        nextProfiles = [...profiles, profile]
      }

      set({ error: null, isLoading: false, profiles: toRecord(nextProfiles) })
      nextProfiles.forEach(preloadProfileAvatar)
    } catch (error) {
      set({ error: getMessage(error), isLoading: false })
    }
  },
  subscribeRealtime: () =>
    subscribeToProfileChanges((event) => {
      if (event.type === 'DELETE') {
        set((state) => {
          const profiles = { ...state.profiles }
          delete profiles[event.id]
          return { profiles }
        })
        return
      }

      preloadProfileAvatar(event.profile)
      set((state) => ({
        profiles: { ...state.profiles, [event.profile.id]: event.profile },
      }))
    }),
  updateProfile: async (userId, input) => {
    try {
      const profile = await updateProfileApi(userId, input)
      preloadProfileAvatar(profile)
      set((state) => ({
        error: null,
        profiles: { ...state.profiles, [profile.id]: profile },
      }))
      return profile
    } catch (error) {
      set({ error: getMessage(error) })
      throw error
    }
  },
}))
