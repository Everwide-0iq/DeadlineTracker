export function findFittingTextScale(maximum: number, fits: (scale: number) => boolean) {
  let low = 0.25
  let high = Math.max(low, maximum)
  for (let step = 0; step < 11; step++) {
    const scale = (low + high) / 2
    if (fits(scale)) low = scale
    else high = scale
  }
  return Math.floor(low * 1000) / 1000
}
