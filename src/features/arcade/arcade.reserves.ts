import { requireSupabase } from '../../lib/supabase.ts'
import { useProjectStore } from '../projects/project.store.ts'
import type { ArcadeSnapshot } from './arcade.model.ts'

export async function loadArcadeReserves(signal: AbortSignal, currentNodes: ArcadeSnapshot['nodes']): Promise<NonNullable<ArcadeSnapshot['reserves']>> {
  const projects = useProjectStore.getState().projects.slice(0, 20)
  if (!projects.length) return []
  // RLS remains the authority. Fetch only titles, never images, descriptions or personal boards.
  let query = requireSupabase().from('cards').select('title, project_id')
    .eq('board_scope', 'shared').in('project_id', projects.map(p => p.id))
    .order('created_at', { ascending: false }).limit(32).abortSignal(signal)
  const ids = currentNodes.map(n => n.id).filter(id => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
  if (ids.length) query = query.not('id', 'in', `(${ids.join(',')})`)
  const { data, error } = await query
  if (error) throw error
  const colors = new Map(projects.map(p => [p.id, p.color]))
  return (data ?? []).map(card => ({ title: card.title, color: colors.get(card.project_id ?? '') ?? '#55e5ed' }))
}
