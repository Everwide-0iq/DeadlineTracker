export type ArcadeMode = 'snake' | 'shooter' | 'rogue' | 'platformer'
export const arcadeModes: ReadonlyArray<{ id: ArcadeMode; name: string }> = [
  { id: 'snake', name: 'Neon Snake' }, { id: 'shooter', name: 'Deadline Blaster' },
  { id: 'rogue', name: 'Scope Creep' }, { id: 'platformer', name: 'Sprint Runner' },
]
export type ArcadePhase = 'ready' | 'playing' | 'paused' | 'over'
export type ArcadeNode = Readonly<{ id: string; title: string; color: string; x: number; y: number; w: number; h: number }>
export type ArcadeSnapshot = Readonly<{
  name: string
  viewport?: Readonly<{ x: number; y: number; zoom: number; width: number; height: number }>
  reserves?: readonly Readonly<{ title: string; color: string }>[]
  nodes: readonly ArcadeNode[]
  links: readonly Readonly<{ from: string; to: string }>[]
  texts: readonly Readonly<{ content: string; color: string; x: number; y: number }>[]
}>
export type ArcadeStats = { score: number; lives: number; level: number; phase: ArcadePhase; elapsedMs?: number; upgrade?: boolean }

export function wrapArcadeTitle(value: string, measure: (text: string) => number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of value.trim().split(/\s+/)) {
    if (line && measure(`${line} ${word}`) > width) { lines.push(line); line = '' }
    for (const char of Array.from((line ? ' ' : '') + word)) {
      if (measure(line + char) > width && line) { lines.push(line); line = '' }
      line += char
    }
  }
  if (line) lines.push(line)
  if (lines.length > 2) {
    let last = lines[1]
    while (last && measure(last + '...') > width) last = last.slice(0, -1)
    return [lines[0], last.trimEnd() + '...']
  }
  return lines
}

// Only presentation data crosses into the game. No mutable store objects or image URLs.
export function snapshotBoard(input: ArcadeSnapshot): ArcadeSnapshot {
  const finite = (n: number) => Number.isFinite(n) ? Math.max(-1e7, Math.min(1e7, n)) : 0
  const color = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : '#55d9e8'
  const nodes = input.nodes.slice(0, 80).map(n => Object.freeze({
    id: n.id, title: n.title.slice(0, 100), color: color(n.color),
    x: finite(n.x), y: finite(n.y), w: Math.min(10000, Math.max(1, finite(n.w))), h: Math.min(10000, Math.max(1, finite(n.h))),
  }))
  const ids = new Set(nodes.map(n => n.id))
  return Object.freeze({
    name: input.name.slice(0, 100), nodes: Object.freeze(nodes),
    viewport: input.viewport ? Object.freeze({ x: finite(input.viewport.x), y: finite(input.viewport.y), zoom: Math.max(.1, Math.min(2, input.viewport.zoom || 1)), width: Math.max(1, finite(input.viewport.width)), height: Math.max(1, finite(input.viewport.height)) }) : undefined,
    reserves: Object.freeze((input.reserves ?? []).slice(0, 32).map(n => Object.freeze({ title: n.title.slice(0, 100), color: color(n.color) }))),
    links: Object.freeze(input.links.filter(l => ids.has(l.from) && ids.has(l.to)).slice(0, 120).map(l => Object.freeze({ from: l.from, to: l.to }))),
    texts: Object.freeze(input.texts.slice(0, 20).map(t => Object.freeze({ content: t.content.slice(0, 80), color: color(t.color), x: finite(t.x), y: finite(t.y) }))),
  })
}

export function boardGameNodes(snapshot: ArcadeSnapshot, width = 1200, height = 720) {
  const view = snapshot.viewport
  if (!view) return snapshot.nodes.map(n => ({ ...n }))
  const scale = Math.min(width / view.width, height / view.height)
  const offsetX = (width - view.width * scale) / 2
  const offsetY = (height - view.height * scale) / 2
  return snapshot.nodes.map(n => ({ ...n,
    x: (n.x * view.zoom + view.x) * scale + offsetX,
    y: (n.y * view.zoom + view.y) * scale + offsetY,
    w: n.w * view.zoom * scale, h: n.h * view.zoom * scale,
  })).filter(n => n.x + n.w > 0 && n.x < width && n.y + n.h > 0 && n.y < height)
}

export type Cell = Readonly<{ x: number; y: number }>
export type Direction = 'up' | 'down' | 'left' | 'right'
const steps: Record<Direction, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y
export function canTurn(current: Direction, next: Direction) {
  return steps[current].x + steps[next].x !== 0 || steps[current].y + steps[next].y !== 0
}
export function stepSnake(body: readonly Cell[], direction: Direction, food: Cell, columns: number, rows: number) {
  const delta = steps[direction]
  const head = { x: body[0].x + delta.x, y: body[0].y + delta.y }
  const ate = sameCell(head, food)
  const collision = head.x < 0 || head.x >= columns || head.y < 0 || head.y >= rows
    || body.slice(0, ate ? body.length : -1).some(c => sameCell(c, head))
  return { body: collision ? [...body] : [head, ...body.slice(0, ate ? body.length : -1)], ate, collision }
}
export function placeFood(body: readonly Cell[], columns: number, rows: number, random = Math.random): Cell | null {
  const occupied = new Set(body.map(c => c.y * columns + c.x))
  const free: Cell[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    if (!occupied.has(y * columns + x)) free.push({ x, y })
  }
  return free.length ? free[Math.min(free.length - 1, Math.floor(Math.max(0, random()) * free.length))] : null
}

export function readBest(userId: string, mode: ArcadeMode): number {
  try {
    const value = Number(localStorage.getItem(`fireboard.arcade.v1.${userId}.${mode}`))
    return Number.isSafeInteger(value) && value > 0 ? value : 0
  } catch { return 0 }
}
export function saveBest(userId: string, mode: ArcadeMode, score: number): boolean {
  if (!Number.isSafeInteger(score) || score < 0) return false
  try {
    localStorage.setItem(`fireboard.arcade.v1.${userId}.${mode}`, String(Math.max(readBest(userId, mode), score)))
    return true
  } catch { return false }
}
