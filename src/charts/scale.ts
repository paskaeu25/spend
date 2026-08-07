/** A rounded step so gridlines land on readable numbers. Works in minor units. */
export function niceStep(rough: number): number {
  if (rough <= 0) return 100
  const pow = 10 ** Math.floor(Math.log10(rough))
  const norm = rough / pow
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return step * pow
}

/** Axis maximum and tick values for a single y-axis. Always one axis, never two. */
export function yTicks(max: number, count = 4): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 100, ticks: [0, 100] }
  const step = niceStep(max / count)
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + 0.5; v += step) ticks.push(Math.round(v))
  return { max: top, ticks }
}
