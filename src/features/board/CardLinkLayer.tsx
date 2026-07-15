import { memo, useMemo, type PointerEvent } from 'react'
import {
  getLinkSource,
  getLinkTarget,
  type BoardLinkEndpoint,
  type BoardLinkNodeKind,
  type CardLink,
  type CardLinkSide,
} from '../cardLinks/cardLink.types.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import type { ConnectableBoardObjectMetric } from './boardObject.types.ts'

export type DraftCardLink = {
  from: BoardLinkEndpoint
  pointer: Point
}

type CardLinkLayerProps = {
  draftLink: DraftCardLink | null
  links: CardLink[]
  nodes: ConnectableBoardObjectMetric[]
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

type NodeRect = Rect & {
  key: string
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

const getNodeKey = (kind: BoardLinkNodeKind, id: string) => `${kind}:${id}`

function getNodeRect(node: ConnectableBoardObjectMetric): NodeRect {
  return {
    bottom: node.y + node.h,
    key: getNodeKey(node.kind, node.id),
    left: node.x,
    right: node.x + node.w,
    top: node.y,
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

function expandNodeRect(rect: NodeRect, margin: number): NodeRect {
  return {
    ...expandRect(rect, margin),
    key: rect.key,
  }
}

function getAnchorPointFromRect(rect: Rect, side: CardLinkSide): Point {
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

function scoreRoute(
  points: Point[],
  obstacles: NodeRect[],
  sourceKey: string,
  targetKey: string,
) {
  let intersections = 0
  let routeLeft = Number.POSITIVE_INFINITY
  let routeRight = Number.NEGATIVE_INFINITY
  let routeTop = Number.POSITIVE_INFINITY
  let routeBottom = Number.NEGATIVE_INFINITY

  for (const point of points) {
    routeLeft = Math.min(routeLeft, point.x)
    routeRight = Math.max(routeRight, point.x)
    routeTop = Math.min(routeTop, point.y)
    routeBottom = Math.max(routeBottom, point.y)
  }

  for (const obstacle of obstacles) {
    if (
      obstacle.key === sourceKey ||
      obstacle.key === targetKey ||
      obstacle.right < routeLeft ||
      obstacle.left > routeRight ||
      obstacle.bottom < routeTop ||
      obstacle.top > routeBottom
    ) {
      continue
    }

    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      const previous = points[pointIndex - 1]
      const point = points[pointIndex]
      if (axisSegmentIntersectsRect(previous, point, obstacle)) {
        intersections += 1
      }
    }
  }

  return getRouteLength(points) + intersections * 12_000 + Math.max(points.length - 2, 0) * 18
}

function getBestRoute(
  candidates: Point[][],
  obstacles: NodeRect[],
  sourceKey: string,
  targetKey: string,
) {
  let bestRoute: Point[] = []
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const route = dedupePoints(candidate)
    const score = scoreRoute(route, obstacles, sourceKey, targetKey)

    if (score < bestScore) {
      bestRoute = route
      bestScore = score
    }
  }

  return bestRoute
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
  sourceRect: NodeRect,
  sourceSide: CardLinkSide,
  targetRect: NodeRect,
  targetSide: CardLinkSide,
  expandedNodeRects: NodeRect[],
): LinkGeometry {
  const start = getAnchorPointFromRect(sourceRect, sourceSide)
  const end = getAnchorPointFromRect(targetRect, targetSide)
  const startOut = offsetPoint(start, sourceSide)
  const endOut = offsetPoint(end, targetSide)
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

  const points = getBestRoute(candidates, expandedNodeRects, sourceRect.key, targetRect.key)

  return {
    midpoint: getPointAtHalfLength(points),
    path: getRoundedPath(points),
    points,
  }
}

function getDraftGeometry(sourceRect: NodeRect, sourceSide: CardLinkSide, pointer: Point): LinkGeometry {
  const start = getAnchorPointFromRect(sourceRect, sourceSide)
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
  draftLink,
  links,
  nodes,
  selectedLinkId,
  onDeleteLink,
  onSelectLink,
}: CardLinkLayerProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const hasLinkWork = links.length > 0 || Boolean(draftLink)
  const nodeByKey = useMemo(
    () => hasLinkWork
      ? new Map(nodes.map((node) => [getNodeKey(node.kind, node.id), node]))
      : new Map<string, ConnectableBoardObjectMetric>(),
    [hasLinkWork, nodes],
  )
  const nodeRectByKey = useMemo(
    () =>
      hasLinkWork
        ? new Map(nodes.map((node) => [getNodeKey(node.kind, node.id), getNodeRect(node)]))
        : new Map<string, NodeRect>(),
    [hasLinkWork, nodes],
  )
  const nodeRects = useMemo(() => Array.from(nodeRectByKey.values()), [nodeRectByKey])
  const expandedNodeRects = useMemo(
    () => nodeRects.map((rect) => expandNodeRect(rect, 14)),
    [nodeRects],
  )

  const linkGeometries = useMemo(
    () =>
      links.flatMap((link) => {
        const source = getLinkSource(link)
        const target = getLinkTarget(link)
        if (!source || !target) return []
        const sourceNode = nodeByKey.get(getNodeKey(source.kind, source.id))
        const targetNode = nodeByKey.get(getNodeKey(target.kind, target.id))
        const sourceRect = nodeRectByKey.get(getNodeKey(source.kind, source.id))
        const targetRect = nodeRectByKey.get(getNodeKey(target.kind, target.id))

        if (!sourceNode || !targetNode || !sourceRect || !targetRect) {
          return []
        }

        const geometry = getLinkGeometry(
          sourceRect,
          source.side,
          targetRect,
          target.side,
          expandedNodeRects,
        )

        return [
          {
            geometry,
            link,
            sourceNode,
            targetNode,
          },
        ]
      }),
    [expandedNodeRects, links, nodeByKey, nodeRectByKey],
  )

  const renderedLinks = useMemo(
    () =>
      linkGeometries.map(({ geometry, link, sourceNode, targetNode }) => {
        return {
          geometry,
          link,
          sourceColor: sourceNode.color,
          targetColor: targetNode.color,
        }
      }),
    [linkGeometries],
  )

  const draft = useMemo(() => {
    if (!draftLink) {
      return null
    }

    const sourceNode = nodeByKey.get(getNodeKey(draftLink.from.kind, draftLink.from.id))
    const sourceRect = nodeRectByKey.get(getNodeKey(draftLink.from.kind, draftLink.from.id))

    if (!sourceNode || !sourceRect) {
      return null
    }

    return {
      color: sourceNode.color,
      geometry: getDraftGeometry(sourceRect, draftLink.from.side, draftLink.pointer),
    }
  }, [draftLink, nodeByKey, nodeRectByKey])

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
                className="card-link-hit-area"
                d={geometry.path}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectLink(link.id)
                }}
                onPointerDown={stopLinkPointer}
              />
              <path
                className="card-link-glow"
                d={geometry.path}
                stroke={`url(#${gradientId})`}
              />
              <path
                className={isSelected ? 'card-link-path card-link-path-selected' : 'card-link-path'}
                d={geometry.path}
                markerEnd={`url(#${markerId})`}
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
          {t.link.delete}
        </button>
      ) : null}
    </>
  )
}

export const CardLinkLayer = memo(CardLinkLayerComponent)
