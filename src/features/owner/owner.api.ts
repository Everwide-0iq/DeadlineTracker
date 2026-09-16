import { requireSupabase, type Json } from '../../lib/supabase.ts'

export type OwnerStatus = { isOwner: boolean; unlockedUntil: string | null; blockedUntil: string | null; ok?: boolean }
export type OwnerRow = { [key: string]: Json | undefined }
export type OwnerView = 'overview' | 'audit' | 'members' | 'projects' | 'invites' | 'board'

export function asRow(value: Json | undefined): OwnerRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid console response')
  return value
}
export const field = (row: OwnerRow, key: string): string => {
  const value = row[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}
export function parseOwnerStatus(value: Json): OwnerStatus {
  const row = asRow(value)
  if (typeof row.isOwner !== 'boolean') throw new Error('Invalid console status')
  const timestamp = (key: string) => {
    if (row[key] === null) return null
    if (typeof row[key] !== 'string' || !Number.isFinite(Date.parse(row[key]))) throw new Error('Invalid console expiry')
    return row[key]
  }
  return { isOwner: row.isOwner, unlockedUntil: timestamp('unlockedUntil'), blockedUntil: timestamp('blockedUntil'), ok: row.ok === true }
}
export const isLockedError = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '42501'

export async function ownerStatus(signal = AbortSignal.timeout(15_000)): Promise<OwnerStatus> {
  const { data, error } = await requireSupabase().rpc('owner_console_status').abortSignal(signal)
  // Older deployments have no console. Do not expose an entry before SQL provisioning.
  if (error?.code === 'PGRST202' || error?.code === '42883') return { isOwner: false, unlockedUntil: null, blockedUntil: null }
  if (error) throw error
  return parseOwnerStatus(data)
}
export async function unlockOwner(pin: string): Promise<OwnerStatus> {
  const { data, error } = await requireSupabase().rpc('owner_console_unlock', { pin_value: pin }).abortSignal(AbortSignal.timeout(15_000))
  if (error) throw error
  return parseOwnerStatus(data)
}
export async function lockOwner() {
  const { error } = await requireSupabase().rpc('owner_console_lock').abortSignal(AbortSignal.timeout(15_000))
  if (error) throw error
}
export async function readOwner(view: OwnerView, filters: OwnerRow, signal: AbortSignal): Promise<OwnerRow | OwnerRow[]> {
  const { data, error } = await requireSupabase().rpc('owner_console_read', { view_name: view, filters }).abortSignal(signal)
  if (error) throw error
  if (view === 'overview') return asRow(data)
  if (!Array.isArray(data)) throw new Error('Invalid console response')
  return data.map(asRow)
}
export async function ownerAction(action: 'revoke_invite' | 'purge_old_audit' | 'export_page', target?: string) {
  const { error } = await requireSupabase().rpc('owner_console_action', { action_name: action, target_id: target ?? null }).abortSignal(AbortSignal.timeout(15_000))
  if (error) throw error
}
