import { memo, useMemo, type PointerEvent } from 'react'
import type { CardLink, CardLinkSide } from '../cardLinks/cardLink.types.ts'
import type { Card } from '../cards/card.types.ts'
import { getCardRenderSize } from '../cards/card.utils.ts'
import { getDeadlineVisualState } from '../cards/deadlineColor.ts'

export type DraftCardLink = {
  fromCardId: string
  fromSide: CardLinkSide
  pointer: Point
}

type CardLinkLayerProps = {
  cards: Card[]
  draftLink: DraftCardLink | null
  links: CardLink[]
  now: number
  selectedLinkId: string | null
  onDeleteLink: (id: string) => void
  onSelectLink: (id: string | null) => void
}

type Point = {
  x: number
  y: number
}

type Rect = {
  bottom: number
  left: number
  right: number
  top: number
}

type LinkGeometry = {
  midpoint: Point
  path: string
  points: Point[]
}

const routeMargin = 46
const cornerRadius = 18

const sideVector: Record<CardLinkSide, Point> = {
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
}

const isHorizontalSide = (side: CardLinkSide) => side === 'left' || side === 'right'

function getCardRect(card: Card): Rect {
  const size = getCardRenderSize(card)

  return {
    bottom: card.y + size.h,
    left: card.x,
    right: card.x + size.w,
    top: card.y,
  }
}

function expandRect(rect: Rect, margin: number): Rect {
  return {
    bottom: rect.bottom + margin,
    left: rect.left - margin,
    right: rect.right + margin,
    top: rect.top - margin,
  }
}

function getAnchorPoint(card: Card, side: CardLinkSide): Point {
  const rect = getCardRect(card)

  switch (side) {
    case 'top':
      return { x: (rect.left + rect.right) / 2, y: rect.top }
    case 'right':
      return { x: rect.right, y: (rect.top + rect.bottom) / 2 }
    case 'bottom':
      return { x: (rect.left + rect.right) / 2, y: rect.bottom }
    case 'left':
      return { x: rect.left, y: (rect.top + rect.bottom) / 2 }
  }
}

function offsetPoint(point: Point, side: CardLinkSide, distance = routeMargin): Point {
  const vector = sideVector[side]
  return {
    x: point.x + vector.x * distance,
    y: point.y + vector.y * distance,
  }
}

function dedupePoints(points: Point[]) {
  return points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || previous.x !== point.x || previous.y !== point.y
  })
}

function getDistance(from: Point, to: Point) {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

function getRouteLength(points: Point[]) {
  return points.reduce((length, point, index) => {
    const previous = points[index - 1]
    return previous ? length + getDistance(previous, point) : length
  }, 0)
}

function axisSegmentIntersectsRect(from: Point, to: Point, rect: Rect) {
  if (from.x === to.x) {
    const minY = Math.min(from.y, to.y)
    const maxY = Math.max(from.y, to.y)
    return from.x >= rect.left && from.x <= rect.right && maxY >= rect.top && minY <= rect.bottom
  }

  if (from.y === to.y) {
    const minX = Math.min(from.x, to.x)
    const maxX = Math.max(from.x, to.x)
    return from.y >= rect.top && from.y <= rect.bottom && maxX >= rect.left && minX <= rect.right
  }

  return false
}

function scoreRoute(points: Point[], obstacles: Rect[]) {
  const intersections = points.reduce((count, point, index) => {
    const previous = points[index - 1]

    if (!previous) {
      return count
    }

    return (
      count +
      obstacles.filter((obstacle) => axisSegmentIntersectsRect(previous, point, obstacle)).length
    )
  }, 0)

  return getRouteLength(points) + intersections * 12_000 + Math.max(points.length - 2, 0) * 18
}

function getBestRoute(candidates: Point[][], obstacles: Rect[]) {
  return candidates
    .map((points) => dedupePoints(points))
    .sort((left, right) => scoreRoute(left, obstacles) - scoreRoute(right, obstacles))[0]
}

function getRoundedPath(points: Point[]) {
  if (points.length < 2) {
    return ''
  }

  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const incomingLength = getDistance(previous, current)
    const outgoingLength = getDistance(current, next)
    const radius = Math.min(cornerRadius, incomingLength / 2, outgoingLength / 2)
    const incomingVector = {
      x: (current.x - previous.x) / incomingLength || 0,
      y: (current.y - previous.y) / incomingLength || 0,
    }
    const outgoingVector = {
      x: (next.x - current.x) / outgoingLength || 0,
      y: (next.y - current.y) / outgoingLength || 0,
    }
    const beforeCorner = {
      x: current.x - incomingVector.x * radius,
      y: current.y - incomingVector.y * radius,
    }
    const afterCorner = {
      x: current.x + outgoingVector.x * radius,
      y: current.y + outgoingVector.y * radius,
    }

    path += ` L ${beforeCorner.x} ${beforeCorner.y} Q ${current.x} ${current.y} ${afterCorner.x} ${afterCorner.y}`
  }

  const end = points[points.length - 1]
  path += ` L ${end.x} ${end.y}`
  return path
}

function getPointAtHalfLength(points: Point[]) {
  const routeLength = getRouteLength(points)
  const targetLength = routeLength / 2
  let walked = 0

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const segmentLength = getDistance(previous, current)

    if (walked + segmentLength >= targetLength) {
      const ratio = segmentLength === 0 ? 0 : (targetLength - walked) / segmentLength
      return {
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      }
    }

    walked += segmentLength
  }

  return points[Math.max(points.length - 1, 0)] ?? { x: 0, y: 0 }
}

function getLinkGeometry(
  sourceCard: Card,
  sourceSide: CardLinkSide,
  targetCard: Card,
  targetSide: CardLinkSide,
  cards: Card[],
): LinkGeometry {
  const start = getAnchorPoint(sourceCard, sourceSide)
  const end = getAnchorPoint(targetCard, targetSide)
  const startOut = offsetPoint(start, sourceSide)
  const endOut = offsetPoint(end, targetSide)
  const sourceRect = getCardRect(sourceCard)
  const targetRect = getCardRect(targetCard)
  const combinedRect = {
    bottom: Math.max(sourceRect.bottom, targetRect.bottom),
    left: Math.min(sourceRect.left, targetRect.left),
    right: Math.max(sourceRect.right, targetRect.right),
    top: Math.min(sourceRect.top, targetRect.top),
  }
  const aboveY = combinedRect.top - routeMargin
  const belowY = combinedRect.bottom + routeMargin
  const leftX = combinedRect.left - routeMargin
  const rightX = combinedRect.right + routeMargin
  const middleX = (startOut.x + endOut.x) / 2
  const middleY = (startOut.y + endOut.y) / 2
  const obstacles = cards
    .filter((card) => card.id !== sourceCard.id && card.id !== targetCard.id)
    .map((card) => expandRect(getCardRect(card), 14))
  const candidates: Point[][] = [
    [start, startOut, { x: middleX, y: startOut.y }, { x: middleX, y: endOut.y }, endOut, end],
    [start, startOut, { x: startOut.x, y: middleY }, { x: endOut.x, y: middleY }, endOut, end],
    [start, startOut, { x: startOut.x, y: aboveY }, { x: endOut.x, y: aboveY }, endOut, end],
    [start, startOut, { x: startOut.x, y: belowY }, { x: endOut.x, y: belowY }, endOut, end],
    [start, startOut, { x: leftX, y: startOut.y }, { x: leftX, y: endOut.y }, endOut, end],
    [start, startOut, { x: rightX, y: startOut.y }, { x: rightX, y: endOut.y }, endOut, end],
  ]

  if (isHorizontalSide(sourceSide) !== isHorizontalSide(targetSide)) {
    candidates.push(
      [start, startOut, { x: endOut.x, y: startOut.y }, endOut, end],
      [start, startOut, { x: startOut.x, y: endOut.y }, endOut, end],
    )
  }

  const points = getBestRoute(candidates, obstacles)

  return {
    midpoint: getPointAtHalfLength(points),
    path: getRoundedPath(points),
    points,
  }
}

function getDraftGeometry(sourceCard: Card, sourceSide: CardLinkSide, pointer: Point): LinkGeometry {
  const start = getAnchorPoint(sourceCard, sourceSide)
  const startOut = offsetPoint(start, sourceSide)
  const middle = isHorizontalSide(sourceSide)
    ? { x: (startOut.x + pointer.x) / 2, y: startOut.y }
    : { x: startOut.x, y: (startOut.y + pointer.y) / 2 }
  const points = isHorizontalSide(sourceSide)
    ? [start, startOut, middle, { x: middle.x, y: pointer.y }, pointer]
    : [start, startOut, middle, { x: pointer.x, y: middle.y }, pointer]

  return {
    midpoint: getPointAtHalfLength(points),
    path: getRoundedPath(dedupePoints(points)),
    points,
  }
}

function sanitizeSvgId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function stopLinkPointer(event: PointerEvent<SVGPathElement>) {
  event.stopPropagation()
}

function CardLinkLayerComponent({
  cards,
  draftLink,
  links,
  now,
  selectedLinkId,
  onDeleteLink,
  onSelectLink,
}: CardLinkLayerProps) {
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])

  const renderedLinks = useMemo(
    () =>
      links.flatMap((link) => {
        const sourceCard = cardById.get(link.fromCardId)
        const targetCard = cardById.get(link.toCardId)

        if (!sourceCard || !targetCard) {
          return []
        }

        const sourceVisual = getDeadlineVisualState(sourceCard.deadlineAt, sourceCard.status, now)
        const targetVisual = getDeadlineVisualState(targetCard.deadlineAt, targetCard.status, now)
        const geometry = getLinkGeometry(sourceCard, link.fromSide, targetCard, link.toSide, cards)

        return [
          {
            geometry,
            link,
            sourceColor: sourceVisual.borderColor,
            targetColor: targetVisual.borderColor,
          },
        ]
      }),
    [cardById, cards, links, now],
  )

  const draft = useMemo(() => {
    if (!draftLink) {
      return null
    }

    const sourceCard = cardById.get(draftLink.fromCardId)

    if (!sourceCard) {
      return null
    }

    const sourceVisual = getDeadlineVisualState(sourceCard.deadlineAt, sourceCard.status, now)

    return {
      color: sourceVisual.borderColor,
      geometry: getDraftGeometry(sourceCard, draftLink.fromSide, draftLink.pointer),
    }
  }, [cardById, draftLink, now])

  const selectedRenderedLink = renderedLinks.find(({ link }) => link.id === selectedLinkId)

  return (
    <>
      <div className="pointer-events-none absolute left-0 top-0 z-[9]">
      <svg className="absolute left-0 top-0 h-px w-px overflow-visible">
        <defs>
          {renderedLinks.map(({ geometry, link, sourceColor, targetColor }) => {
            const gradientId = `card-link-gradient-${sanitizeSvgId(link.id)}`
            const markerId = `card-link-marker-${sanitizeSvgId(link.id)}`
            const start = geometry.points[0]
            const end = geometry.points[geometry.points.length - 1]

            return (
              <g key={link.id}>
                <linearGradient
                  gradientUnits="userSpaceOnUse"
                  id={gradientId}
                  x1={start.x}
                  x2={end.x}
                  y1={start.y}
                  y2={end.y}
                >
                  <stop offset="0%" stopColor={sourceColor} />
                  <stop offset="48%" stopColor={sourceColor} />
                  <stop offset="52%" stopColor={targetColor} />
                  <stop offset="100%" stopColor={targetColor} />
                </linearGradient>
                <marker
                  id={markerId}
                  markerHeight="12"
                  markerUnits="userSpaceOnUse"
                  markerWidth="14"
                  orient="auto"
                  refX="13"
                  refY="6"
                  viewBox="0 0 14 12"
                >
                  <path d="M 1 1 L 13 6 L 1 11 L 4.5 6 z" fill={targetColor} />
                </marker>
              </g>
            )
          })}
        </defs>

        {renderedLinks.map(({ geometry, link }) => {
          const gradientId = `card-link-gradient-${sanitizeSvgId(link.id)}`
          const markerId = `card-link-marker-${sanitizeSvgId(link.id)}`
          const isSelected = selectedLinkId === link.id

          return (
            <g className="card-link-group" key={link.id}>
              <path
                className="card-link-glow"
                d={geometry.path}
                stroke={`url(#${gradientId})`}
              />
              <path
                className={isSelected ? 'card-link-path card-link-path-selected' : 'card-link-path'}
                d={geometry.path}
                markerEnd={`url(#${markerId})`}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectLink(link.id)
                }}
                onPointerDown={stopLinkPointer}
                stroke={`url(#${gradientId})`}
              />
              <path className="card-link-flow" d={geometry.path} />
            </g>
          )
        })}

        {draft ? (
          <g>
            <path className="card-link-draft-glow" d={draft.geometry.path} stroke={draft.color} />
            <path className="card-link-draft-path" d={draft.geometry.path} stroke={draft.color} />
            <circle
              className="card-link-draft-end"
              cx={draft.geometry.points[draft.geometry.points.length - 1]?.x ?? 0}
              cy={draft.geometry.points[draft.geometry.points.length - 1]?.y ?? 0}
              r="6"
              stroke={draft.color}
            />
          </g>
        ) : null}
      </svg>
      </div>
      {selectedRenderedLink ? (
        <button
          className="card-link-delete-popover"
          data-card-action="true"
          style={{
            left: selectedRenderedLink.geometry.midpoint.x,
            top: selectedRenderedLink.geometry.midpoint.y,
          }}
          type="button"
          onClick={() => onDeleteLink(selectedRenderedLink.link.id)}
        >
          Удалить связь
        </button>
      ) : null}
    </>
  )
}

export const CardLinkLayer = memo(CardLinkLayerComponent)
