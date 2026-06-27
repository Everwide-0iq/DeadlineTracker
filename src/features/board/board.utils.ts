import { defaultCardSize } from '../cards/card.utils.ts'
import type { BoardCamera } from './useBoardCamera.ts'

export function getBoardCenterPosition(camera: BoardCamera) {
  const sidebarWidth = 304
  const viewportWidth = Math.max(window.innerWidth - sidebarWidth, 1)
  const viewportHeight = Math.max(window.innerHeight, 1)

  return {
    x: (viewportWidth / 2 - camera.x) / camera.zoom - defaultCardSize.w / 2,
    y: (viewportHeight / 2 - camera.y) / camera.zoom - defaultCardSize.h / 2,
  }
}
