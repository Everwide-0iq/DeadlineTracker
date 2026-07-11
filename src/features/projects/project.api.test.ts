import { describe, expect, it } from 'vitest'
import { sortProjects } from './project.api.ts'
import { defaultProjectId, type Project } from './project.types.ts'

const createProject = (id: string, sortOrder: number, createdAt: string): Project => ({
  color: '#ff463d',
  createdAt,
  createdBy: 'user-1',
  id,
  name: id,
  sortOrder,
  updatedAt: createdAt,
})

describe('sortProjects', () => {
  it('always keeps General first and resolves equal order by creation time', () => {
    const newest = createProject('newest', 1000, '2026-07-03T00:00:00.000Z')
    const oldest = createProject('oldest', 1000, '2026-07-01T00:00:00.000Z')
    const general = createProject(defaultProjectId, 9999, '2026-07-04T00:00:00.000Z')

    expect(sortProjects([newest, general, oldest])).toEqual([general, oldest, newest])
  })
})
