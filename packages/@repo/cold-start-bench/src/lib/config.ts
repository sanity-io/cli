import {readFile} from 'node:fs/promises'

import {type NetworkProfile} from './throttle.ts'

export const ENTRY_POINTS = ['npx-sanity-init', 'npm-create-sanity'] as const
export type EntryPoint = (typeof ENTRY_POINTS)[number]

export interface Thresholds {
  /** A marker gap this much longer than base fails the run's correctness check */
  markerGapIncreaseMs: number
  /** More installed packages than base by more than this fails */
  packageCountIncrease: number
  /** A first-output slowdown must exceed this many milliseconds… */
  timeRegressionMinMs: number
  /** …and this many times the measured spread before it fails */
  timeRegressionSpreads: number
  /** More downloaded bytes than base by more than this percentage fails */
  wireBytesIncreasePercent: number
}

export interface BenchConfig {
  /** Share of each entry point in the headline score; weights should sum to 1 */
  entries: Record<EntryPoint, {weight: number}>
  /** Output that proves `init` got past startup; see README "Why the marker" */
  marker: string
  network: NetworkProfile
  runs: number
  /** Published `sanity` version that is repacked around the CLI under test */
  sanityVersion: string
  thresholds: Thresholds
  timeoutMs: number
}

function fail(message: string): never {
  throw new Error(`Invalid bench config: ${message}`)
}

/** Reads a dotted path such as `network.rttMs` from parsed JSON */
function at(input: unknown, path: string): unknown {
  let value = input
  for (const key of path.split('.')) {
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  }
  return value
}

function number(input: unknown, path: string): number {
  const value = at(input, path)
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`"${path}" must be a non-negative number`)
  }
  return value
}

export function parseConfig(input: unknown): BenchConfig {
  if (!input || typeof input !== 'object') fail('expected an object')

  const sanityVersion = at(input, 'sanityVersion')
  if (typeof sanityVersion !== 'string' || !/^\d+\.\d+\.\d+/.test(sanityVersion)) {
    fail('"sanityVersion" must be an exact version like 6.13.2')
  }
  const marker = at(input, 'marker')
  if (typeof marker !== 'string' || marker === '') fail('"marker" must be a string')

  const entries = {} as BenchConfig['entries']
  for (const entry of ENTRY_POINTS) {
    entries[entry] = {weight: number(input, `entries.${entry}.weight`)}
  }
  const unknownEntries = Object.keys(at(input, 'entries') ?? {}).filter(
    (key) => !(ENTRY_POINTS as readonly string[]).includes(key),
  )
  if (unknownEntries.length > 0) fail(`unknown entries: ${unknownEntries.join(', ')}`)

  const runs = number(input, 'runs')
  if (!Number.isInteger(runs) || runs < 1) fail('"runs" must be a whole number of at least 1')

  return {
    entries,
    marker,
    network: {
      downMbps: number(input, 'network.downMbps'),
      rttMs: number(input, 'network.rttMs'),
      upMbps: number(input, 'network.upMbps'),
    },
    runs,
    sanityVersion,
    thresholds: {
      markerGapIncreaseMs: number(input, 'thresholds.markerGapIncreaseMs'),
      packageCountIncrease: number(input, 'thresholds.packageCountIncrease'),
      timeRegressionMinMs: number(input, 'thresholds.timeRegressionMinMs'),
      timeRegressionSpreads: number(input, 'thresholds.timeRegressionSpreads'),
      wireBytesIncreasePercent: number(input, 'thresholds.wireBytesIncreasePercent'),
    },
    timeoutMs: number(input, 'timeoutMs'),
  }
}

export async function loadConfig(path: string): Promise<BenchConfig> {
  return parseConfig(JSON.parse(await readFile(path, 'utf8')))
}
