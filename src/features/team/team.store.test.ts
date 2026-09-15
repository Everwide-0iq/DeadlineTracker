import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamAccess } from './team.types.ts'
const api = vi.hoisted(() => ({ fetchMyTeamAccess: vi.fn(), subscribeToMyTeamMembership: vi.fn() }))
vi.mock('./team.api.ts', () => api)
import { useTeamStore } from './team.store.ts'

const access = (role: 'editor' | 'admin'): TeamAccess => ({
  member: { role, userId: 'user', teamId: 'team', joinedAt: '', updatedAt: '' },
  team: { id: 'team', name: 'Team', createdAt: '', updatedAt: '', createdBy: null },
  projectAccess: {},
})
beforeEach(() => { useTeamStore.getState().clear(); vi.clearAllMocks() })
describe('access refresh', () => {
  it('invalidates board data on promotion but not on unchanged refreshes', async () => {
    api.fetchMyTeamAccess.mockResolvedValue(access('editor'))
    await useTeamStore.getState().loadAccess('user')
    const version = useTeamStore.getState().accessVersion
    await useTeamStore.getState().loadAccess('user')
    expect(useTeamStore.getState().accessVersion).toBe(version)
    api.fetchMyTeamAccess.mockResolvedValue(access('admin'))
    await useTeamStore.getState().loadAccess('user')
    expect(useTeamStore.getState().accessVersion).toBe(version + 1)
  })
  it('ignores an older response after a newer access request completes', async () => {
    let resolve!: (value: TeamAccess) => void
    api.fetchMyTeamAccess.mockReturnValueOnce(new Promise<TeamAccess>(done => { resolve = done }))
      .mockResolvedValueOnce(access('admin'))
    const old = useTeamStore.getState().loadAccess('user')
    await useTeamStore.getState().loadAccess('user')
    resolve(access('editor')); await old
    expect(useTeamStore.getState().member?.role).toBe('admin')
  })
  it('does not turn a temporary network failure into lost membership', async () => {
    api.fetchMyTeamAccess.mockResolvedValueOnce(access('admin')).mockRejectedValueOnce(new Error('Offline'))
    await useTeamStore.getState().loadAccess('user')
    const version = useTeamStore.getState().accessVersion
    await useTeamStore.getState().loadAccess('user')
    expect(useTeamStore.getState().member?.role).toBe('admin')
    expect(useTeamStore.getState().accessVersion).toBe(version)
    expect(useTeamStore.getState().error).toBe('Offline')
  })
  it('invalidates data when project grants change or membership is revoked', async () => {
    api.fetchMyTeamAccess.mockResolvedValueOnce(access('editor'))
      .mockResolvedValueOnce({ ...access('editor'), projectAccess: { project: 'viewer' } })
      .mockResolvedValueOnce({ member: null, team: null, projectAccess: {} })
    await useTeamStore.getState().loadAccess('user')
    const version = useTeamStore.getState().accessVersion
    await useTeamStore.getState().loadAccess('user')
    expect(useTeamStore.getState().accessVersion).toBe(version + 1)
    await useTeamStore.getState().loadAccess('user')
    expect(useTeamStore.getState().accessVersion).toBe(version + 2)
    expect(useTeamStore.getState().member).toBeNull()
  })
})
