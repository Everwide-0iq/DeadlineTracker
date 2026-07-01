import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireSupabase } from '../../lib/supabase.ts'
import { defaultProjectId, type CreateProjectInput, type Project, type ProjectRow } from './project.types.ts'

export type ProjectRealtimeEvent =
  | { type: 'INSERT'; project: Project }
  | { type: 'UPDATE'; project: Project }
  | { type: 'DELETE'; id: string }

const normalizeColor = (color: string) => color.trim().toLowerCase()

export function mapProjectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    color: normalizeColor(row.color),
    sortOrder: row.sort_order ?? 0,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toInsertRow(input: CreateProjectInput, userId: string | null) {
  return {
    name: input.name,
    color: normalizeColor(input.color),
    sort_order: input.sortOrder ?? 0,
    created_by: userId,
  }
}

export async function fetchProjects() {
  const { data, error } = await requireSupabase()
    .from('projects')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return sortProjects((data ?? []).map(mapProjectFromRow))
}

export async function createProject(input: CreateProjectInput, userId: string | null) {
  const { data, error } = await requireSupabase()
    .from('projects')
    .insert(toInsertRow(input, userId))
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapProjectFromRow(data)
}

export async function updateProjectOrders(projects: Project[]) {
  const updates = projects
    .filter((project) => project.id !== defaultProjectId)
    .map((project) =>
      requireSupabase()
        .from('projects')
        .update({ sort_order: project.sortOrder })
        .eq('id', project.id)
        .select('*')
        .single(),
    )

  const results = await Promise.all(updates)
  const error = results.find((result) => result.error)?.error

  if (error) {
    throw error
  }

  return sortProjects(
    projects.map((project) => {
      const updated = results.find((result) => result.data?.id === project.id)?.data
      return updated ? mapProjectFromRow(updated) : project
    }),
  )
}

export async function deleteProject(id: string) {
  if (id === defaultProjectId) {
    throw new Error('Проект "Общее" нельзя удалить.')
  }

  const { error } = await requireSupabase().from('projects').delete().eq('id', id)

  if (error) {
    throw error
  }
}

export function sortProjects(projects: Project[]) {
  return [...projects].sort((left, right) => {
    if (left.id === defaultProjectId) {
      return -1
    }

    if (right.id === defaultProjectId) {
      return 1
    }

    const orderDelta = left.sortOrder - right.sortOrder

    if (orderDelta !== 0) {
      return orderDelta
    }

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  })
}

export function subscribeToProjectChanges(onEvent: (event: ProjectRealtimeEvent) => void) {
  const channel = requireSupabase()
    .channel('fireboard:projects')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'projects' },
      (payload: RealtimePostgresChangesPayload<ProjectRow>) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old.id

          if (typeof id === 'string') {
            onEvent({ type: 'DELETE', id })
          }

          return
        }

        const project = mapProjectFromRow(payload.new)
        onEvent({ type: payload.eventType, project })
      },
    )
    .subscribe()

  return () => {
    void requireSupabase().removeChannel(channel)
  }
}
