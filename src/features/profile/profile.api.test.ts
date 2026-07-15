import { describe, expect, it } from 'vitest'
import { mapProfileFromRow } from './profile.api.ts'

describe('mapProfileFromRow', () => {
  it('maps public profile presentation fields', () => {
    const profile = mapProfileFromRow({
      active_color: '#4ade80',
      avatar_path: 'user-1/avatar.webp',
      created_at: '2026-07-01T00:00:00.000Z',
      id: 'user-1',
      nickname: 'Everwide',
      updated_at: '2026-07-15T00:00:00.000Z',
    })

    expect(profile).toMatchObject({
      activeColor: '#4ade80',
      avatarPath: 'user-1/avatar.webp',
      id: 'user-1',
      nickname: 'Everwide',
    })
  })
})
