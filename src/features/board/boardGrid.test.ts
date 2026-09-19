import { describe, expect, it } from 'vitest'
import { getBoardGridStyle } from './boardGrid.ts'

describe('composited board grid', () => {
  it('keeps the same phase across positive and negative world coordinates', () => {
    expect(getBoardGridStyle({ x: -1, y: 35, zoom: 1 })).toEqual({
      backgroundSize: '34px 34px', transform: 'translate(33px, 1px)',
    })
    expect(getBoardGridStyle({ x: 33, y: 1, zoom: 1 })).toEqual(
      getBoardGridStyle({ x: -1, y: 35, zoom: 1 }),
    )
  })
  it('retains the existing grid density limits', () => {
    expect(getBoardGridStyle({ x: 0, y: 0, zoom: 0.1 }).backgroundSize).toBe('18px 18px')
    expect(getBoardGridStyle({ x: 0, y: 0, zoom: 2 }).backgroundSize).toBe('68px 68px')
    expect(getBoardGridStyle({ x: 0, y: 0, zoom: 3 }).backgroundSize).toBe('72px 72px')
  })
})
