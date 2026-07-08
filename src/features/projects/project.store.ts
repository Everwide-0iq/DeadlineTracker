import { create } from 'zustand'
import { getCurrentTranslation } from '../i18n/i18n.store.ts'
import {
  createProject as createProjectApi,
  deleteProject as deleteProjectApi,
  fetchProjects,
  sortProjects,
  subscribeToProjectChanges,
  updateProjectOrders,
} from './project.api.ts'
import { defaultProjectId, type CreateProjectInput, type Project, type ProjectMoveDirection } from './project.types.ts'

type ProjectState = {
  error: string | null
  hasLoaded: boolean
  isLoading: boolean
  projects: Project[]
  createProject: (input: CreateProjectInput, userId: string | null) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  loadProjects: () => Promise<void>
  moveProject: (id: string, direction: ProjectMoveDirection) => Promise<void>
  subscribeRealtime: () => () => void
}

const getMessage = (error: unknown) => {
  const t = getCurrentTranslation()

  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const code = typeof record.code === 'string' ? record.code : null
    const message = typeof record.message === 'string' ? record.message : null

    if (code === 'PGRST205' || message?.includes("Could not find the table 'public.projects'")) {
      return t.errors.projectsMissingTable
    }

    if (message?.includes("Could not find the 'sort_order' column") || message?.includes('sort_order')) {
      return t.errors.projectsMissingSortOrder
    }

    if (message) {
      return message
    }
  }

  return t.errors.projectsGeneric
}

const upsertProject = (projects: Project[], project: Project) => {
  const index = projects.findIndex((item) => item.id === project.id)

  if (index === -1) {
    return sortProjects([...projects, project])
  }

  const next = [...projects]
  next[index] = project
  return sortProjects(next)
}

const getNextSortOrder = (projects: Project[]) => {
  const movableProjects = projects.filter((project) => project.id !== defaultProjectId)
  const maxSortOrder = movableProjects.reduce((max, project) => Math.max(max, project.sortOrder), 0)
  return maxSortOrder + 1000
}

const withNormalizedSortOrder = (projects: Project[]) => {
  const defaultProject = projects.find((project) => project.id === defaultProjectId)
  const sorted = [
    ...(defaultProject ? [defaultProject] : []),
    ...projects.filter((project) => project.id !== defaultProjectId),
  ]
  let nextSortOrder = 1000

  return sorted.map((project) => {
    if (project.id === defaultProjectId) {
      return { ...project, sortOrder: 0 }
    }

    const nextProject = { ...project, sortOrder: nextSortOrder }
    nextSortOrder += 1000
    return nextProject
  })
}

const moveProjectInList = (projects: Project[], id: string, direction: ProjectMoveDirection) => {
  if (id === defaultProjectId) {
    return projects
  }

  const sharedProject = projects.find((project) => project.id === defaultProjectId)
  const movableProjects = sortProjects(projects.filter((project) => project.id !== defaultProjectId))
  const currentIndex = movableProjects.findIndex((project) => project.id === id)

  if (currentIndex === -1) {
    return projects
  }

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

  if (targetIndex < 0 || targetIndex >= movableProjects.length) {
    return projects
  }

  const nextMovableProjects = [...movableProjects]
  const [project] = nextMovableProjects.splice(currentIndex, 1)
  nextMovableProjects.splice(targetIndex, 0, project)

  return withNormalizedSortOrder(sharedProject ? [sharedProject, ...nextMovableProjects] : nextMovableProjects)
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  error: null,
  hasLoaded: false,
  isLoading: false,
  projects: [],
  createProject: async (input, userId) => {
    set({ error: null })

    try {
      const project = await createProjectApi({ ...input, sortOrder: getNextSortOrder(get().projects) }, userId)
      set((state) => ({ projects: upsertProject(state.projects, project) }))
      return project
    } catch (error) {
      set({ error: getMessage(error) })
      throw error
    }
  },
  deleteProject: async (id) => {
    if (id === defaultProjectId) {
      set({ error: getCurrentTranslation().errors.generalProjectDeleteForbidden })
      return
    }

    const previousProjects = get().projects
    set((state) => ({
      error: null,
      projects: state.projects.filter((project) => project.id !== id),
    }))

    try {
      await deleteProjectApi(id)
    } catch (error) {
      set({ error: getMessage(error), projects: previousProjects })
      throw error
    }
  },
  moveProject: async (id, direction) => {
    if (id === defaultProjectId) {
      return
    }

    const previousProjects = get().projects
    const nextProjects = moveProjectInList(previousProjects, id, direction)

    if (nextProjects === previousProjects) {
      return
    }

    set({ error: null, projects: nextProjects })

    try {
      const savedProjects = await updateProjectOrders(nextProjects)
      set({ projects: savedProjects })
    } catch (error) {
      set({ error: getMessage(error), projects: previousProjects })
      throw error
    }
  },
  loadProjects: async () => {
    set({ error: null, isLoading: true })

    try {
      const projects = await fetchProjects()
      set({ error: null, hasLoaded: true, isLoading: false, projects })
    } catch (error) {
      set({ error: getMessage(error), hasLoaded: true, isLoading: false })
    }
  },
  subscribeRealtime: () =>
    subscribeToProjectChanges((event) => {
      if (event.type === 'DELETE') {
        set((state) => ({
          projects: state.projects.filter((project) => project.id !== event.id),
        }))
        return
      }

      set((state) => ({ projects: upsertProject(state.projects, event.project) }))
    }),
}))
