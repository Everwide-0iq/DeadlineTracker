export const defaultActiveColor = '#65e7ff'

export type UserProfile = {
  id: string
  nickname: string
  avatarPath: string | null
  activeColor: string
  createdAt: string
  updatedAt: string
}

export type ProfileRow = {
  id: string
  nickname: string
  avatar_path: string | null
  active_color: string
  created_at: string
  updated_at: string
}

export type UpdateProfileInput = {
  nickname?: string
  avatarPath?: string | null
  activeColor?: string
}

export function getFallbackNickname(email: string | null, fallback = 'Member') {
  const emailName = email?.split('@')[0]?.trim()
  return emailName || fallback
}
