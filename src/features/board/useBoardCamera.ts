import { useCallback, useEffect, useRef, useState } from 'react'
import { readStorageValue, writeStorageValue } from '../../lib/storage.ts'

export type BoardCamera = {
  x: number
  y: number
  zoom: number
}

const storageKey = 'fireboard.camera.v1'
const minZoom = 0.1
const maxZoom = 2

const defaultCamera: BoardCamera = {
  x: 120,
  y: 80,
  zoom: 1,
}

const persistDelayMs = 420
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function readStoredCamera(): BoardCamera {
  if (typeof window === 'undefined') {
    return defaultCamera
  }

  try {
    const raw = readStorageValue(storageKey)

    if (!raw) {
      return defaultCamera
    }

    const parsed = JSON.parse(raw) as Partial<BoardCamera>

    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.zoom === 'number'
    ) {
      return {
        x: parsed.x,
        y: parsed.y,
        zoom: clamp(parsed.zoom, minZoom, maxZoom),
      }
    }
  } catch {
    return defaultCamera
  }

  return defaultCamera
}

function persistCamera(camera: BoardCamera) {
  writeStorageValue(storageKey, JSON.stringify(camera))
}

export function useBoardCamera() {
  const [camera, setCameraState] = useState(readStoredCamera)
  const latestCameraRef = useRef(camera)
  const persistTimerRef = useRef<number | null>(null)

  const setCamera = useCallback((next: BoardCamera | ((current: BoardCamera) => BoardCamera)) => {
    setCameraState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      return {
        x: resolved.x,
        y: resolved.y,
        zoom: clamp(resolved.zoom, minZoom, maxZoom),
      }
    })
  }, [])

  useEffect(() => {
    latestCameraRef.current = camera

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current)
    }

    persistTimerRef.current = window.setTimeout(() => {
      persistCamera(latestCameraRef.current)
      persistTimerRef.current = null
    }, persistDelayMs)

    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
    }
  }, [camera])

  useEffect(() => {
    const flushCamera = () => persistCamera(latestCameraRef.current)

    window.addEventListener('pagehide', flushCamera)

    return () => {
      window.removeEventListener('pagehide', flushCamera)
    }
  }, [])

  const zoomBy = useCallback(
    (factor: number) => setCamera((current) => ({ ...current, zoom: current.zoom * factor })),
    [setCamera],
  )

  return {
    camera,
    setCamera,
    zoomBy,
  }
}
