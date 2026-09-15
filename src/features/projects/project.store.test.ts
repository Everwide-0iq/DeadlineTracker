import { describe, expect, it, vi } from 'vitest'
import type { Project } from './project.types.ts'
vi.mock('./project.api.ts', async importOriginal => ({ ...await importOriginal<typeof import('./project.api.ts')>(), fetchProjects: vi.fn() }))
import { fetchProjects } from './project.api.ts'
import { useProjectStore } from './project.store.ts'

describe('project access refresh races', () => {
  it('does not let a pre-invitation response erase newly visible projects', async () => {
    let resolve!: (value: Project[]) => void
    const project: Project = { id: 'existing', name: 'Existing project', color: '#ff534b', teamId: 'team', createdBy: null, createdAt: '', updatedAt: '', sortOrder: 0 }
    vi.mocked(fetchProjects).mockReturnValueOnce(new Promise(done => { resolve = done })).mockResolvedValueOnce([project])
    const old = useProjectStore.getState().loadProjects()
    await useProjectStore.getState().loadProjects()
    resolve([]); await old
    expect(useProjectStore.getState().projects).toEqual([project])
  })
})
