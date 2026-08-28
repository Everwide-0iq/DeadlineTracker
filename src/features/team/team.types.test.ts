import { describe, expect, it } from 'vitest'
import { canContributeToProject, canCreateTeamProject, isTeamAdmin } from './team.types.ts'

describe('team permissions', () => {
  it('keeps administrative project access independent from an explicit project record', () => {
    expect(isTeamAdmin('owner')).toBe(true)
    expect(isTeamAdmin('admin')).toBe(true)
    expect(canContributeToProject('admin', undefined)).toBe(true)
  })

  it('only allows the intended roles to create projects', () => {
    expect(canCreateTeamProject('owner')).toBe(true)
    expect(canCreateTeamProject('admin')).toBe(true)
    expect(canCreateTeamProject('editor')).toBe(true)
    expect(canCreateTeamProject('member')).toBe(false)
    expect(canCreateTeamProject('viewer')).toBe(false)
  })

  it('does not treat a viewer project grant as edit access', () => {
    expect(canContributeToProject('member', 'viewer')).toBe(false)
    expect(canContributeToProject('member', 'contributor')).toBe(true)
    expect(canContributeToProject('editor', 'editor')).toBe(true)
  })
})
