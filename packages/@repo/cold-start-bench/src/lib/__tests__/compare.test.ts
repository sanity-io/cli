import {describe, expect, test} from 'vitest'

import {
  compareEntry,
  compareVariants,
  type EntrySummary,
  formatBytes,
  type RunResult,
  score,
  summarizeEntry,
  summarizeVariant,
} from '../compare.ts'
import {type Thresholds} from '../config.ts'

const thresholds: Thresholds = {
  markerGapIncreaseMs: 250,
  packageCountIncrease: 0,
  timeRegressionMinMs: 1000,
  timeRegressionSpreads: 3,
  wireBytesIncreasePercent: 1,
}

function run(overrides: Partial<RunResult> = {}): RunResult {
  return {
    end: 'marker',
    entry: 'npx-sanity-init',
    firstOutputMs: 20_000,
    firstScreen: 'Warning\nFetching providers',
    markerMs: 20_020,
    modeledDownloadMs: 0,
    run: 0,
    tree: null,
    variant: 'base',
    wireBytesDown: 1000,
    wireBytesUp: 10,
    wireConnections: 4,
    wireRequests: 8,
    ...overrides,
  }
}

// One run: 20 s to first output, 20 ms marker gap, no spread, 100 packages
function entrySummary(overrides: Partial<EntrySummary> = {}): EntrySummary {
  return {
    ...summarizeEntry([run({tree: {bytes: 5000, packageCount: 100, packages: {}}})]),
    ...overrides,
  }
}

describe('summarizeEntry', () => {
  test('summarizes complete runs and counts incomplete ones', () => {
    const summary = summarizeEntry([
      run({tree: {bytes: 5000, packageCount: 100, packages: {}}, wireBytesDown: 900}),
      run({firstOutputMs: 22_000, markerMs: 22_050, wireBytesDown: 1100}),
      run({end: 'timeout', firstOutputMs: null, markerMs: null, wireBytesDown: 1000}),
    ])
    expect(summary).toMatchObject({
      failedRuns: 1,
      firstScreen: 'Warning\nFetching providers',
      packageBytes: 5000,
      packageCount: 100,
      runs: 3,
      wireBytesDown: 1000,
    })
    expect(summary.firstOutput?.median).toBe(21_000)
    expect(summary.markerGap?.median).toBe(35)
  })

  test('a run that printed but never reached the marker is incomplete', () => {
    const summary = summarizeEntry([run({end: 'exited', markerMs: null})])
    expect(summary.failedRuns).toBe(1)
    expect(summary.firstOutput).toBeNull()
    expect(summary.markerGap).toBeNull()
  })

  test('handles no runs', () => {
    expect(summarizeEntry([])).toMatchObject({firstOutput: null, runs: 0, wireBytesDown: 0})
  })
})

describe('summarizeVariant and score', () => {
  const runs = [
    run({entry: 'npx-sanity-init', firstOutputMs: 30_000, markerMs: 30_010}),
    run({entry: 'npm-create-sanity', firstOutputMs: 20_000, markerMs: 20_010}),
    run({entry: 'npx-sanity-init', variant: 'head'}),
  ]

  test('splits runs by variant and entry point', () => {
    const summary = summarizeVariant(runs, 'base')
    expect(summary['npx-sanity-init'].runs).toBe(1)
    expect(summary['npm-create-sanity'].runs).toBe(1)
  })

  test('weights medians into one number', () => {
    const entries = {'npm-create-sanity': {weight: 0.25}, 'npx-sanity-init': {weight: 0.75}}
    expect(score(summarizeVariant(runs, 'base'), entries)).toBe(27_500)
  })

  test('is null when an entry point has no output', () => {
    const entries = {'npm-create-sanity': {weight: 0.5}, 'npx-sanity-init': {weight: 0.5}}
    expect(score(summarizeVariant(runs, 'head'), entries)).toBeNull()
  })
})

function slowerThan(base: EntrySummary, ms: number, spread = 0): EntrySummary {
  return entrySummary({firstOutput: {...base.firstOutput!, median: base.firstOutput!.median + ms, spread}})
}

describe('compareEntry', () => {
  const base = entrySummary()

  function statuses(head: EntrySummary) {
    return Object.fromEntries(
      compareEntry('npx-sanity-init', base, head, thresholds).map((c) => [c.name, c.status]),
    )
  }

  test('passes when nothing changed', () => {
    expect(statuses(entrySummary())).toEqual({
      'first-output': 'pass',
      'first-screen': 'pass',
      'marker-gap': 'pass',
      'package-count': 'pass',
      'wire-bytes': 'pass',
    })
  })

  test('fails on more packages or more bytes', () => {
    const head = entrySummary({packageCount: 101, wireBytesDown: 1011})
    expect(statuses(head)).toMatchObject({'package-count': 'fail', 'wire-bytes': 'fail'})
  })

  test('passes on fewer packages and bytes', () => {
    const head = entrySummary({packageCount: 90, wireBytesDown: 500})
    const checks = compareEntry('npx-sanity-init', base, head, thresholds)
    expect(checks.find((c) => c.name === 'package-count')?.message).toBe('90 packages (-10)')
    expect(checks.find((c) => c.name === 'wire-bytes')?.message).toBe(
      '500 B downloaded (-50.0%)',
    )
    expect(statuses(head)).toMatchObject({'package-count': 'pass', 'wire-bytes': 'pass'})
  })

  test('a slowdown fails only beyond the minimum and the noise', () => {
    expect(statuses(slowerThan(base, 900))['first-output']).toBe('pass')
    expect(statuses(slowerThan(base, 1100))['first-output']).toBe('fail')
    // 3 × hypot(0, 500) = 1500 ms allowed
    expect(statuses(slowerThan(base, 1400, 500))['first-output']).toBe('pass')
  })

  test('fails when output moves ahead of the work it stands for', () => {
    const head = entrySummary({markerGap: {...base.markerGap!, median: base.markerGap!.median + 300}})
    expect(statuses(head)['marker-gap']).toBe('fail')
  })

  test('warns when the first screen changes', () => {
    expect(statuses(entrySummary({firstScreen: 'Different'}))['first-screen']).toBe('warn')
  })

  test('skips the package check without a tree', () => {
    expect(statuses(entrySummary({packageCount: null}))).not.toHaveProperty('package-count')
  })

  test('reports incomplete runs instead of comparing', () => {
    const checks = compareEntry('npx-sanity-init', base, entrySummary({failedRuns: 1}), thresholds)
    expect(checks).toEqual([
      {
        entry: 'npx-sanity-init',
        message: 'Incomplete runs (base 0/1, head 1/1 failed)',
        name: 'runs',
        status: 'fail',
      },
    ])
  })

  test('treats zero base bytes as no change', () => {
    const zero = entrySummary({wireBytesDown: 0})
    const checks = compareEntry('npx-sanity-init', zero, zero, thresholds)
    expect(checks.find((c) => c.name === 'wire-bytes')?.status).toBe('pass')
  })
})

describe('compareVariants', () => {
  test('compares every entry point', () => {
    const summary = {'npm-create-sanity': entrySummary(), 'npx-sanity-init': entrySummary()}
    const entries = new Set(compareVariants(summary, summary, thresholds).map((c) => c.entry))
    expect([...entries]).toEqual(['npx-sanity-init', 'npm-create-sanity'])
  })
})

describe('formatBytes', () => {
  test.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [3 * 1024 ** 3, '3.0 GB'],
  ])('%d → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})
