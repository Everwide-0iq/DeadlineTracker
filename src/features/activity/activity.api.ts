import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireSupabase } from '../../lib/supabase.ts'
import type { ActivityEvent, ActivityEventRow } from './activity.types.ts'

export type ActivityRealtimeEvent = { type: 'INSERT'; event: ActivityEvent }

export function mapActivityEventFromRow(row: ActivityEventRow): ActivityEvent {
  const metadata =
    typeof row.metadata === 'object' && row.metadata !== null && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}

  return {
    action: row.action,
    actorId: row.actor_id,
    actorLabel: row.actor_label,
    boardScope: row.board_scope,
    cardId: row.card_id,
    createdAt: row.created_at,
    entityId: row.entity_id,
    entityTitle: row.entity_title,
    entityType: row.entity_type,
    id: row.id,
    metadata,
    projectId: row.project_id,
  }
}

export async function fetchActivityEvents() {
  const { data, error } = await requireSupabase()
    .from('activity_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => mapActivityEventFromRow(row as ActivityEventRow))
}

export function subscribeToActivityEvents(onEvent: (event: ActivityRealtimeEvent) => void) {
  const channel = requireSupabase()
    .channel('fireboard:activity')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'activity_events' },
      (payload: RealtimePostgresChangesPayload<ActivityEventRow>) => {
        onEvent({ event: mapActivityEventFromRow(payload.new as ActivityEventRow), type: 'INSERT' })
      },
    )
    .subscribe()

  return () => {
    void requireSupabase().removeChannel(channel)
  }
}
