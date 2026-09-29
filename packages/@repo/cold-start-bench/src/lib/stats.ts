export interface Summary {
  max: number
  median: number
  min: number
  n: number
  /** Nearest-rank 90th percentile */
  p90: number
  /**
   * Median absolute deviation scaled by 1.4826, a standard-deviation estimate
   * that one slow outlier run can't inflate.
   */
  spread: number
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median of an empty list')
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export function summarize(values: readonly number[]): Summary {
  if (values.length === 0) throw new Error('summary of an empty list')
  const sorted = values.toSorted((a, b) => a - b)
  const mid = median(sorted)
  const deviations = sorted.map((value) => Math.abs(value - mid))
  const rank = Math.max(1, Math.ceil(0.9 * sorted.length))
  return {
    max: sorted.at(-1)!,
    median: mid,
    min: sorted[0],
    n: sorted.length,
    p90: sorted[rank - 1],
    spread: median(deviations) * 1.4826,
  }
}
