export const defaultProjectId = '00000000-0000-0000-0000-000000000001'

export type Project = {
  id: string
  name: string
  color: string
  sortOrder: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type ProjectRow = {
  id: string
  name: string
  color: string
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CreateProjectInput = {
  name: string
  color: string
  sortOrder?: number
}

export type ProjectMoveDirection = 'up' | 'down'

export type ProjectDeadlineSummary = {
  color: string
  countdown: string
  label: string
  title: string
}
