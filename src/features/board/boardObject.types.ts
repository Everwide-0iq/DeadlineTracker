export type BoardObjectKind = 'card' | 'todo' | 'text'
export type ConnectableBoardObjectKind = Exclude<BoardObjectKind, 'text'>

export type BoardObjectMetric<Kind extends BoardObjectKind = BoardObjectKind> = {
  color: string
  h: number
  id: string
  kind: Kind
  w: number
  x: number
  y: number
}

export type ConnectableBoardObjectMetric = BoardObjectMetric<ConnectableBoardObjectKind>
