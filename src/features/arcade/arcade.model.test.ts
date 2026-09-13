import { afterEach, describe, expect, it, vi } from 'vitest'
import { canTurn, placeFood, readBest, sameCell, saveBest, snapshotBoard, stepSnake, wrapArcadeTitle } from './arcade.model.ts'

afterEach(() => vi.unstubAllGlobals())

describe('arcade snapshot boundary', () => {
  it('wraps titles at words and bounds long words to two lines', () => {
    expect(wrapArcadeTitle('One more task', text => text.length, 8)).toEqual(['One more', 'task'])
    const lines = wrapArcadeTitle('a'.repeat(100), text => text.length, 12)
    expect(lines).toHaveLength(2)
    expect(lines.every(line => line.length <= 12)).toBe(true)
    expect(lines[1].endsWith('...')).toBe(true)
  })
  it('copies and freezes presentation data without retaining board references', () => {
    const nodes = [{ id: 'a', title: 'Task', color: '#ff534b', x: 0, y: 0, w: 340, h: 190, secret: 'not copied' }]
    const input = { name: 'Board', nodes, links: [{ from: 'a', to: 'missing' }], texts: [{ content: 'hello', color: '#ffffff', x: 0, y: 0 }] }
    const snapshot = snapshotBoard(input)
    nodes[0].title = 'changed'
    input.texts[0].content = 'changed'
    expect(snapshot.nodes[0].title).toBe('Task')
    expect(snapshot.texts[0].content).toBe('hello')
    expect(snapshot.nodes[0]).not.toHaveProperty('secret')
    expect(Object.isFrozen(snapshot.nodes[0])).toBe(true)
    expect(Object.isFrozen(snapshot.nodes)).toBe(true)
    expect(snapshot.links).toEqual([])
  })
  it('bounds visual workload and sanitizes invalid geometry', () => {
    const snapshot = snapshotBoard({ name: 'B', links: [], texts: [], nodes: Array.from({ length: 500 }, (_, i) => ({ id: String(i), title: 't'.repeat(500), color: 'invalid', x: NaN, y: Infinity, w: -5, h: 0 })) })
    expect(snapshot.nodes).toHaveLength(80)
    expect(snapshot.nodes[0]).toMatchObject({ x: 0, y: 0, w: 1, h: 1, color: '#55d9e8' })
    expect(snapshot.nodes[0].title).toHaveLength(100)
  })
})

describe('snake', () => {
  it('rejects reversing and permits turns', () => {
    expect(canTurn('up', 'down')).toBe(false)
    expect(canTurn('right', 'left')).toBe(false)
    expect(canTurn('up', 'left')).toBe(true)
  })
  it('grows only when eating without mutating the previous body', () => {
    const body = Object.freeze([{ x: 2, y: 2 }, { x: 1, y: 2 }])
    expect(stepSnake(body, 'right', { x: 3, y: 2 }, 5, 5)).toMatchObject({ ate: true, collision: false, body: [{ x: 3, y: 2 }, ...body] })
    expect(body).toHaveLength(2)
    expect(stepSnake(body, 'right', { x: 4, y: 2 }, 5, 5).body).toHaveLength(2)
  })
  it('detects walls and body collisions, but allows moving into the departing tail', () => {
    expect(stepSnake([{ x: 0, y: 0 }], 'left', { x: 2, y: 2 }, 5, 5).collision).toBe(true)
    const loop = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }]
    expect(stepSnake(loop, 'down', { x: 4, y: 4 }, 5, 5).collision).toBe(true)
    expect(stepSnake(loop, 'right', { x: 4, y: 4 }, 5, 5).collision).toBe(false)
  })
  it('places food only on free cells and terminates on a full grid', () => {
    const body = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]
    expect(placeFood(body, 2, 2, () => .99)).toEqual({ x: 1, y: 1 })
    expect(placeFood([...body, { x: 1, y: 1 }], 2, 2)).toBeNull()
    const cell = placeFood(body, 5, 5)!
    expect(body.some(c => sameCell(c, cell))).toBe(false)
  })
})

describe('local records', () => {
  it('isolates users and games and never lowers a record', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) })
    expect(saveBest('a', 'snake', 100)).toBe(true)
    saveBest('a', 'snake', 10)
    expect(readBest('a', 'snake')).toBe(100)
    expect(readBest('b', 'snake')).toBe(0)
    expect(readBest('a', 'shooter')).toBe(0)
    expect(saveBest('a', 'snake', Infinity)).toBe(false)
  })
  it('handles corrupt storage and blocked browser persistence', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'bad', setItem: () => { throw Error('quota') } })
    expect(readBest('a', 'snake')).toBe(0)
    expect(saveBest('a', 'snake', 50)).toBe(false)
    vi.stubGlobal('localStorage', { getItem: () => { throw Error('denied') } })
    expect(readBest('a', 'snake')).toBe(0)
  })
})
