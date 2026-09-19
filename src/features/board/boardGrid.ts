import type { BoardCamera } from './useBoardCamera.ts'

export function getBoardGridStyle(camera: BoardCamera) {
  const size = Math.min(72, Math.max(18, 34 * camera.zoom))
  // Keep the compositor layer bounded even after travelling far across the board.
  const x = ((camera.x % size) + size) % size
  const y = ((camera.y % size) + size) % size
  return {
    backgroundSize: `${size}px ${size}px`,
    transform: `translate(${x}px, ${y}px)`,
  }
}
