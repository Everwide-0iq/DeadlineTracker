import type { TranslationMessages } from '../i18n/translations.ts'
import { defaultProjectId, type Project } from './project.types.ts'

type ProjectNameSource = Pick<Project, 'id' | 'name'> | null | undefined

export function getProjectDisplayName(project: ProjectNameSource, t: TranslationMessages) {
  if (!project) {
    return null
  }

  return project.id === defaultProjectId ? t.project.general : project.name
}
