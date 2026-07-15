import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireSupabase } from '../../lib/supabase.ts'
import {
  defaultActiveColor,
  getFallbackNickname,
  type ProfileRow,
  type UpdateProfileInput,
  type UserProfile,
} from './profile.types.ts'

export type ProfileRealtimeEvent =
  | { type: 'INSERT' | 'UPDATE'; profile: UserProfile }
  | { type: 'DELETE'; id: string }

export function mapProfileFromRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    nickname: row.nickname,
    avatarPath: row.avatar_path ?? null,
    activeColor: row.active_color || defaultActiveColor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toUpdateRow(input: UpdateProfileInput) {
  return {
    ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
    ...(input.avatarPath !== undefined ? { avatar_path: input.avatarPath } : {}),
    ...(input.activeColor !== undefined ? { active_color: input.activeColor } : {}),
  }
}

export async function fetchProfiles() {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapProfileFromRow)
}

export async function ensureProfile(userId: string, email: string | null) {
  const nickname = getFallbackNickname(email).slice(0, 32)
  const { data, error } = await requireSupabase()
    .from('profiles')
    .insert({ id: userId, nickname, active_color: defaultActiveColor })
    .select('*')
    .single()

  if (!error) {
    return mapProfileFromRow(data)
  }

  if (error.code !== '23505') {
    throw error
  }

  const { data: existing, error: fetchError } = await requireSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (fetchError) {
    throw fetchError
  }

  return mapProfileFromRow(existing)
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .update(toUpdateRow(input))
    .eq('id', userId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapProfileFromRow(data)
}

export function subscribeToProfileChanges(onEvent: (event: ProfileRealtimeEvent) => void) {
  const channel = requireSupabase()
    .channel('fireboard:profiles')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles' },
      (payload: RealtimePostgresChangesPayload<ProfileRow>) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old.id

          if (typeof id === 'string') {
            onEvent({ type: 'DELETE', id })
          }

          return
        }

        onEvent({ type: payload.eventType, profile: mapProfileFromRow(payload.new) })
      },
    )
    .subscribe()

  return () => {
    void requireSupabase().removeChannel(channel)
  }
}
