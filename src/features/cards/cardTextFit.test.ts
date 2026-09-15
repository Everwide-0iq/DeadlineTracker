import { describe, expect, it } from 'vitest'
import { findFittingTextScale } from './cardTextFit.ts'

describe('card text fitting', () => {
  it('uses tall-card space without the chrome width-scale limit', () => {
    const result = findFittingTextScale(12, scale => scale <= 3.75)
    expect(result).toBeGreaterThan(3.74)
    expect(result).toBeLessThanOrEqual(3.75)
  })
  it('stays below a wrapping boundary', () => {
    const height = (scale: number) => Math.ceil(2 * scale) * 28 * scale
    const result = findFittingTextScale(10, scale => height(scale) <= 300)
    expect(height(result)).toBeLessThanOrEqual(300)
    expect(height(result + 0.02)).toBeGreaterThan(300)
  })
  it('can reduce dense text and bounds measurement work', () => {
    let calls = 0
    const result = findFittingTextScale(1, scale => { calls++; return scale <= 0.8 })
    expect(result).toBeGreaterThan(0.79)
    expect(result).toBeLessThanOrEqual(0.8)
    expect(calls).toBe(11)
  })
})
