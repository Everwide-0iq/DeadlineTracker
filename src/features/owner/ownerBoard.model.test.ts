import { describe, expect, it } from 'vitest'
import { boardBounds, fitBoard, inViewport, parseBoardSnapshot, zoomAt } from './ownerBoard.model.ts'

const empty = { name: 'Board', capturedAt: '2026-09-16T12:00:00Z', cards: [], todos: [], items: [], texts: [], links: [], profiles: [] }
describe('isolated admin board model', () => {
  it('retains exact stored coordinates, including negative positions', () => {
    const result = parseBoardSnapshot({ ...empty, cards: [{ id: 'card', title: 'Task', x: -800, y: 200, w: 400, h: 600, status: 'done', board_scope: 'personal' }] })
    expect(result.cards[0]).toMatchObject({ x: -800, y: 200, w: 400, h: 600, status: 'done', boardScope: 'personal' })
  })
  it('rejects malformed snapshots before rendering', () => {
    expect(() => parseBoardSnapshot(null)).toThrow()
    expect(() => parseBoardSnapshot({ ...empty, cards: [{ x: '123' }] })).toThrow()
    expect(() => parseBoardSnapshot({ ...empty, texts: [{ x: 0, y: 0, w: 300, font_size: 0 }] })).toThrow()
    expect(() => parseBoardSnapshot({ ...empty, links: [{ from_side: 'center' }] })).toThrow()
    expect(() => parseBoardSnapshot({ ...empty, todos: [{ x: 0, y: 0, w: -1 }] })).toThrow()
  })
  it('fits all four edges with padding and no upscale', () => {
    const bounds = boardBounds([{ x: -600, y: -100, w: 300, h: 200 }, { x: 800, y: 400, w: 500, h: 600 }])
    const camera = fitBoard(bounds, 1000, 700)
    expect(bounds).toEqual({ x: -600, y: -100, w: 1900, h: 1100 })
    expect(bounds.x * camera.zoom + camera.x).toBeGreaterThanOrEqual(39.99)
    expect((bounds.x + bounds.w) * camera.zoom + camera.x).toBeLessThanOrEqual(960.01)
    expect(bounds.y * camera.zoom + camera.y).toBeGreaterThanOrEqual(39.99)
    expect((bounds.y + bounds.h) * camera.zoom + camera.y).toBeLessThanOrEqual(660.01)
    expect(fitBoard({ x: 0, y: 0, w: 10, h: 10 }, 1000, 700).zoom).toBe(1)
  })
  it('keeps zoom anchored to the cursor and bounded', () => {
    const camera = { x: -120, y: 35, zoom: 0.5 }
    const next = zoomAt(camera, 1.7, 300, 200)
    expect((300 - next.x) / next.zoom).toBeCloseTo((300 - camera.x) / camera.zoom)
    expect((200 - next.y) / next.zoom).toBeCloseTo((200 - camera.y) / camera.zoom)
    expect(zoomAt(camera, 1000, 0, 0).zoom).toBe(2)
    expect(zoomAt(camera, 0, 0, 0).zoom).toBe(0.02)
  })
  it('culls offscreen objects with overscan and handles an empty board', () => {
    expect(boardBounds([])).toEqual({ x: 0, y: 0, w: 800, h: 600 })
    expect(inViewport({ x: -100, y: 0, w: 40, h: 40 }, { x: 0, y: 0, zoom: 1 }, 500, 500)).toBe(true)
    expect(inViewport({ x: 800, y: 0, w: 40, h: 40 }, { x: 0, y: 0, zoom: 1 }, 500, 500)).toBe(false)
  })
})
