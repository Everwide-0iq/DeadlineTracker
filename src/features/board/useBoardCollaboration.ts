import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { requireSupabase } from '../../lib/supabase.ts'

type SupabaseClient = ReturnType<typeof requireSupabase>
type BoardChannel = ReturnType<SupabaseClient['channel']>

export type BoardMember = {
  avatarPath?: string | null
  clientId: string
  color: string
  email: string
  name: string
  onlineAt: string
  userId: string | null
}

export type BoardCursor = BoardMember & {
  updatedAt: number
  x: number
  y: number
}

type UseBoardCollaborationOptions = {
  enabled: boolean
  fallbackName: string
  roomId: string
  userAvatarPath?: string | null
  userColor?: string | null
  userEmail: string | null
  userId: string | null
  userName?: string | null
}

const cursorThrottleMs = 70
const cursorTtlMs = 8000

const createClientId = () => {
  if ('crypto' in window && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }

  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const getName = (email: string | null, fallbackName: string) => {
  if (!email) {
    return fallbackName
  }

  return email.split('@')[0] || fallbackName
}

const getColor = (seed: string) => {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash)
  }

  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 86% 62%)`
}

const isMember = (value: unknown): value is BoardMember => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    typeof record.clientId === 'string' &&
    typeof record.color === 'string' &&
    typeof record.email === 'string' &&
    typeof record.name === 'string'
  )
}

const isCursor = (value: unknown): value is BoardCursor =>
  isMember(value) &&
  typeof (value as Record<string, unknown>).updatedAt === 'number' &&
  typeof (value as Record<string, unknown>).x === 'number' &&
  typeof (value as Record<string, unknown>).y === 'number'

export function useBoardCollaboration({
  enabled,
  fallbackName,
  roomId,
  userAvatarPath = null,
  userColor = null,
  userEmail,
  userId,
  userName = null,
}: UseBoardCollaborationOptions) {
  const clientId = useMemo(createClientId, [])
  const channelRef = useRef<BoardChannel | null>(null)
  const lastCursorAtRef = useRef(0)
  const [members, setMembers] = useState<BoardMember[]>([])
  const [remoteCursors, setRemoteCursors] = useState<BoardCursor[]>([])
  const self = useMemo<BoardMember>(
    () => ({
      avatarPath: userAvatarPath,
      clientId,
      color: userColor ?? getColor(userEmail ?? userId ?? clientId),
      email: userEmail ?? 'unknown@fireboard.local',
      name: userName?.trim() || getName(userEmail, fallbackName),
      onlineAt: new Date().toISOString(),
      userId,
    }),
    [clientId, fallbackName, userAvatarPath, userColor, userEmail, userId, userName],
  )

  useEffect(() => {
    if (!enabled) {
      channelRef.current = null
      setMembers([])
      setRemoteCursors([])
      return undefined
    }

    const supabase = requireSupabase()
    const channel = supabase.channel(`fireboard:presence:${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: clientId },
      },
    })
    channelRef.current = channel

    const syncMembers = () => {
      const state = channel.presenceState<BoardMember>()
      const nextMembers = Object.values(state)
        .flat()
        .filter((member) => isMember(member) && member.clientId !== clientId)

      setMembers(nextMembers)
    }

    channel
      .on('presence', { event: 'sync' }, syncMembers)
      .on<BoardCursor>('broadcast', { event: 'cursor' }, ({ payload }) => {
        if (!isCursor(payload) || payload.clientId === clientId) {
          return
        }

        setRemoteCursors((current) => [
          payload,
          ...current.filter((cursor) => cursor.clientId !== payload.clientId),
        ])
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track(self).catch(() => undefined)
        }
      })

    return () => {
      channelRef.current = null
      setMembers([])
      setRemoteCursors([])
      void channel.untrack().catch(() => undefined)
      void supabase.removeChannel(channel)
    }
  }, [clientId, enabled, roomId, self])

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now()
      setRemoteCursors((current) =>
        current.filter((cursor) => now - cursor.updatedAt < cursorTtlMs),
      )
    }, 2000)

    return () => window.clearInterval(intervalId)
  }, [enabled])

  const sendCursor = useCallback(
    (x: number, y: number) => {
      const now = Date.now()

      if (!enabled) {
        return
      }

      if (now - lastCursorAtRef.current < cursorThrottleMs) {
        return
      }

      lastCursorAtRef.current = now
      void channelRef.current
        ?.send({
          event: 'cursor',
          payload: { ...self, updatedAt: now, x, y },
          type: 'broadcast',
        })
        .catch(() => undefined)
    },
    [enabled, self],
  )

  return {
    members,
    remoteCursors,
    self,
    sendCursor,
  }
}
