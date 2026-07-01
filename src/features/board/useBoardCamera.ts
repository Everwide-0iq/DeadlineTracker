import { useCallback, useState } from 'react'
import { readStorageValue, writeStorageValue } from '../../lib/storage.ts'

export type BoardCamera = {
  x: number
  y: number
  zoom: number
}

const storageKey = 'fireboard.camera.v1'
const minZoom = 0.45
const maxZoom = 1.6

const defaultCamera: BoardCamera = {
  x: 120,
  y: 80,
  zoom: 1,
}

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

  const setCamera = useCallback((next: BoardCamera | ((current: BoardCamera) => BoardCamera)) => {
    setCameraState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      const cameraToStore = {
        x: resolved.x,
        y: resolved.y,
        zoom: clamp(resolved.zoom, minZoom, maxZoom),
      }

      persistCamera(cameraToStore)
      return cameraToStore
    })
  }, [])

  const resetCamera = useCallback(() => setCamera(defaultCamera), [setCamera])
  const zoomBy = useCallback(
    (factor: number) => setCamera((current) => ({ ...current, zoom: current.zoom * factor })),
    [setCamera],
  )

  return {
    camera,
    maxZoom,
    minZoom,
    resetCamera,
    setCamera,
    zoomBy,
  }
}
