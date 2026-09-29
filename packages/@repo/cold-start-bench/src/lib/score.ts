import {ENTRY_POINTS, type EntryPoint, type MeasuredRun} from './measure.ts'
import {largestPackages} from './tree.ts'

/** Reference network the download part of the score is calculated for */
const NETWORK = {downMbps: 50, rttMs: 40}

/** npm's default `maxsockets` in npm 11 */
const PARALLEL_CONNECTIONS = 15

/**
 * Normally the marker follows the CLI's first output by about 20 ms. A much
 * larger gap means output was moved ahead of the work it stands for.
 */
const MAX_MARKER_GAP_MS = 250

/**
 * Download time on the reference network: every byte at its bandwidth, plus
 * one round trip per request spread over npm's parallel connections.
 */
export function modelDownloadMs(bytes: number, requests: number): number {
  const transfer = (bytes * 8) / (NETWORK.downMbps * 1000)
  const latency = (requests * NETWORK.rttMs) / PARALLEL_CONNECTIONS
  return Math.round(transfer + latency)
}

export function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export interface ScoredRun extends MeasuredRun {
  bytes: number
  entry: EntryPoint
  requests: number
}

export interface EntryResult {
  bytesDownloaded: number
  largestPackages: {bytes: number; id: string}[]
  /** Median milliseconds from first output to the marker */
  markerGapMs: number | null
  packages: number | null
  packagesBytes: number | null
  problems: string[]
  /** Median milliseconds a user waits for the CLI's first output */
  waitMs: number | null
}

export function scoreEntry(runs: readonly ScoredRun[]): EntryResult {
  const problems: string[] = runs.length === 0 ? ['no runs'] : []
  const complete = runs.filter((r) => r.end === 'marker' && r.firstOutputMs !== null && r.markerMs !== null)
  if (complete.length < runs.length) {
    problems.push(`${runs.length - complete.length} of ${runs.length} runs never reached the marker`)
  }
  const gap = complete.length > 0 ? median(complete.map((r) => r.markerMs! - r.firstOutputMs!)) : null
  if (gap !== null && gap > MAX_MARKER_GAP_MS) {
    problems.push(`first output came ${Math.round(gap)}ms before the CLI was ready (max ${MAX_MARKER_GAP_MS}ms)`)
  }
  const tree = runs.find((r) => r.tree)?.tree ?? null
  return {
    bytesDownloaded: runs.length > 0 ? median(runs.map((r) => r.bytes)) : 0,
    largestPackages: tree ? largestPackages(tree) : [],
    markerGapMs: gap,
    packages: tree?.packageCount ?? null,
    packagesBytes: tree?.bytes ?? null,
    problems,
    waitMs:
      complete.length > 0
        ? median(complete.map((r) => r.firstOutputMs! + modelDownloadMs(r.bytes, r.requests)))
        : null,
  }
}

export interface BenchResult {
  entries: Record<EntryPoint, EntryResult>
  passed: boolean
  /** Average wait over both entry points, in milliseconds. Lower is better */
  score: number | null
}

export function scoreRuns(runs: readonly ScoredRun[]): BenchResult {
  const entries = {} as Record<EntryPoint, EntryResult>
  for (const entry of ENTRY_POINTS) entries[entry] = scoreEntry(runs.filter((r) => r.entry === entry))
  const waits = ENTRY_POINTS.map((e) => entries[e].waitMs)
  const passed = ENTRY_POINTS.every((e) => entries[e].problems.length === 0)
  return {
    entries,
    passed,
    score: waits.every((w) => w !== null) ? Math.round(median(waits as number[])) : null,
  }
}
