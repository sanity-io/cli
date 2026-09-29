import {type BenchConfig, ENTRY_POINTS, type EntryPoint, type Thresholds} from './config.ts'
import {median, summarize, type Summary} from './stats.ts'
import {type InstalledTree} from './tree.ts'

export interface RunResult {
  /** How the run ended: the marker appeared, the process exited first, or it timed out */
  end: 'exited' | 'marker' | 'timeout'
  entry: EntryPoint
  firstOutputMs: number | null
  /** Visible output from the CLI's first line up to the marker */
  firstScreen: string
  markerMs: number | null
  run: number
  /** Only kept for the first run of each entry point; the tree doesn't change between runs */
  tree: InstalledTree | null
  variant: string
  wireBytesDown: number
  wireBytesUp: number
  wireConnections: number

  /** Visible output of a run that didn't reach the marker */
  output?: string
}

export interface EntrySummary {
  failedRuns: number
  firstOutput: Summary | null
  firstScreen: string
  markerGap: Summary | null
  packageBytes: number | null
  packageCount: number | null
  runs: number
  wireBytesDown: number
}

export function summarizeEntry(runs: readonly RunResult[]): EntrySummary {
  const complete = runs.filter((r) => r.firstOutputMs !== null && r.markerMs !== null)
  const tree = runs.find((r) => r.tree)?.tree ?? null
  return {
    failedRuns: runs.length - complete.length,
    firstOutput: complete.length > 0 ? summarize(complete.map((r) => r.firstOutputMs!)) : null,
    firstScreen: complete[0]?.firstScreen ?? '',
    markerGap:
      complete.length > 0 ? summarize(complete.map((r) => r.markerMs! - r.firstOutputMs!)) : null,
    packageBytes: tree?.bytes ?? null,
    packageCount: tree?.packageCount ?? null,
    runs: runs.length,
    wireBytesDown: runs.length > 0 ? median(runs.map((r) => r.wireBytesDown)) : 0,
  }
}

export type VariantSummary = Record<EntryPoint, EntrySummary>

export function summarizeVariant(runs: readonly RunResult[], variant: string): VariantSummary {
  const summary = {} as VariantSummary
  for (const entry of ENTRY_POINTS) {
    summary[entry] = summarizeEntry(runs.filter((r) => r.variant === variant && r.entry === entry))
  }
  return summary
}

/**
 * The headline number: a weighted sum of median milliseconds to first output.
 * `null` when an entry point never produced output, since a partial score would
 * look like an improvement.
 */
export function score(summary: VariantSummary, entries: BenchConfig['entries']): number | null {
  let total = 0
  for (const entry of ENTRY_POINTS) {
    const firstOutput = summary[entry].firstOutput
    if (!firstOutput) return null
    total += entries[entry].weight * firstOutput.median
  }
  return Math.round(total)
}

export interface Check {
  entry: EntryPoint
  message: string
  name: 'first-output' | 'first-screen' | 'marker-gap' | 'package-count' | 'runs' | 'wire-bytes'
  status: 'fail' | 'pass' | 'warn'
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`
const signed = (value: number, format: (n: number) => string) =>
  `${value >= 0 ? '+' : '-'}${format(Math.abs(value))}`

export function compareEntry(
  entry: EntryPoint,
  base: EntrySummary,
  head: EntrySummary,
  thresholds: Thresholds,
): Check[] {
  if (head.failedRuns > 0 || base.failedRuns > 0 || !head.firstOutput || !base.firstOutput) {
    return [
      {
        entry,
        message: `Incomplete runs (base ${base.failedRuns}/${base.runs}, head ${head.failedRuns}/${head.runs} failed)`,
        name: 'runs',
        status: 'fail',
      },
    ]
  }

  const checks: Check[] = []

  if (base.packageCount !== null && head.packageCount !== null) {
    const delta = head.packageCount - base.packageCount
    checks.push({
      entry,
      message: `${head.packageCount} packages (${signed(delta, String)})`,
      name: 'package-count',
      status: delta > thresholds.packageCountIncrease ? 'fail' : 'pass',
    })
  }

  const wireDelta = head.wireBytesDown - base.wireBytesDown
  const wirePercent = base.wireBytesDown > 0 ? (wireDelta / base.wireBytesDown) * 100 : 0
  checks.push({
    entry,
    message: `${formatBytes(head.wireBytesDown)} downloaded (${signed(wirePercent, (n) => `${n.toFixed(1)}%`)})`,
    name: 'wire-bytes',
    status: wirePercent > thresholds.wireBytesIncreasePercent ? 'fail' : 'pass',
  })

  const timeDelta = head.firstOutput.median - base.firstOutput.median
  const noise = Math.hypot(base.firstOutput.spread, head.firstOutput.spread)
  const allowed = Math.max(thresholds.timeRegressionMinMs, thresholds.timeRegressionSpreads * noise)
  checks.push({
    entry,
    message: `${seconds(head.firstOutput.median)} to first output (${signed(timeDelta, seconds)}, fails above ${signed(allowed, seconds)})`,
    name: 'first-output',
    status: timeDelta > allowed ? 'fail' : 'pass',
  })

  const gapDelta = head.markerGap!.median - base.markerGap!.median
  checks.push({
    entry,
    message: `${Math.round(head.markerGap!.median)}ms from first output to marker (${signed(gapDelta, (n) => `${Math.round(n)}ms`)})`,
    name: 'marker-gap',
    status: gapDelta > thresholds.markerGapIncreaseMs ? 'fail' : 'pass',
  }, {
    entry,
    message:
      head.firstScreen === base.firstScreen
        ? 'Output up to the marker matches base'
        : 'Output up to the marker differs from base',
    name: 'first-screen',
    status: head.firstScreen === base.firstScreen ? 'pass' : 'warn',
  })

  return checks
}

export function compareVariants(
  base: VariantSummary,
  head: VariantSummary,
  thresholds: Thresholds,
): Check[] {
  return ENTRY_POINTS.flatMap((entry) => compareEntry(entry, base[entry], head[entry], thresholds))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes
  let unit = 'B'
  for (const next of units) {
    if (value < 1024) break
    value /= 1024
    unit = next
  }
  return `${value.toFixed(1)} ${unit}`
}
