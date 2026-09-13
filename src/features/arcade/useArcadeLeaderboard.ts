import { useCallback, useEffect, useRef, useState } from 'react'
import { requireSupabase, type Database } from '../../lib/supabase.ts'
import type { ArcadeMode } from './arcade.model.ts'

export type LeaderboardEntry = Database['public']['Functions']['get_arcade_leaderboard']['Returns'][number]
export type LeaderboardStatus = 'loading' | 'ready' | 'offline' | 'setup' | 'no-team'
type PendingScore = { teamId: string; mode: ArcadeMode; token: string; score: number; duration: number }
const missingSchema = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && (error.code === 'PGRST202' || error.code === '42883')

export function useArcadeLeaderboard(teamId: string | null, mode: ArcadeMode) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [status, setStatus] = useState<LeaderboardStatus>('loading')
  const [saving, setSaving] = useState<'idle' | 'saving' | 'failed'>('idle')
  const alive = useRef(true)
  const version = useRef(0)
  const fetchVersion = useRef(0)
  const pending = useRef<PendingScore | null>(null)
  const controllers = useRef(new Set<AbortController>())
  const invalidate = useCallback(() => { version.current++ }, [])
  const request = useCallback(async <T,>(work: (signal: AbortSignal) => PromiseLike<T>): Promise<T> => {
    const controller = new AbortController()
    controllers.current.add(controller)
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try { return await work(controller.signal) }
    finally { clearTimeout(timer); controllers.current.delete(controller) }
  }, [])

  const refresh = useCallback(async () => {
    const generation = version.current
    const fetchGeneration = ++fetchVersion.current
    if (!teamId) { setStatus('no-team'); return }
    setStatus('loading')
    try {
      const { data, error } = await request(signal => requireSupabase().rpc('get_arcade_leaderboard', { target_team_id: teamId, game_mode: mode }).abortSignal(signal))
      if (!alive.current || version.current !== generation || fetchVersion.current !== fetchGeneration) return
      if (error) throw error
      setEntries(data ?? []); setStatus('ready')
    } catch (error) {
      if (alive.current && version.current === generation && fetchVersion.current === fetchGeneration) setStatus(missingSchema(error) ? 'setup' : 'offline')
    }
  }, [teamId, mode, request])

  useEffect(() => {
    alive.current = true
    const requests = controllers.current
    return () => { alive.current = false; for (const controller of requests) controller.abort() }
  }, [])

  useEffect(() => {
    invalidate()
    const requests = controllers.current
    pending.current = null
    setEntries([]); setSaving('idle')
    void refresh()
    return () => { invalidate(); for (const controller of requests) controller.abort() }
  }, [refresh, invalidate])

  const begin = useCallback(async () => {
    if (!teamId || status === 'setup' || status === 'no-team') return null
    const generation = version.current
    try {
      const { data, error } = await request(signal => requireSupabase().rpc('begin_arcade_run', { target_team_id: teamId, game_mode: mode }).abortSignal(signal))
      if (error) throw error
      return alive.current && version.current === generation ? data : null
    } catch (error) {
      if (alive.current && version.current === generation) setStatus(missingSchema(error) ? 'setup' : 'offline')
      return null
    }
  }, [teamId, mode, status, request])

  const send = useCallback(async (result: PendingScore) => {
    const generation = version.current
    if (alive.current) setSaving('saving')
    try {
      const { error } = await request(signal => requireSupabase().rpc('submit_arcade_score', {
        target_team_id: result.teamId, game_mode: result.mode, run_token: result.token,
        final_score: result.score, duration_ms: result.duration,
      }).abortSignal(signal))
      if (error) throw error
      if (alive.current && version.current === generation) {
        pending.current = null; setSaving('idle'); await refresh()
      }
    } catch {
      if (alive.current && version.current === generation) { pending.current = result; setSaving('failed') }
    }
  }, [request, refresh])

  const submit = useCallback((token: string | null, score: number, duration: number) => {
    if (!token || !teamId || score <= 0) return
    void send({ teamId, mode, token, score, duration })
  }, [teamId, mode, send])
  const retry = () => { if (pending.current) void send(pending.current); else void refresh() }
  return { entries, status, saving, refresh, begin, submit, retry }
}
