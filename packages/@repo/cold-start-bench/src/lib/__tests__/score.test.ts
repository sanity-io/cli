import {describe, expect, test} from 'vitest'

import {median, modelDownloadMs, type ScoredRun, scoreEntry, scoreRuns} from '../score.ts'

function run(overrides: Partial<ScoredRun> = {}): ScoredRun {
  return {
    bytes: 1_000_000,
    end: 'marker',
    entry: 'npx-sanity-init',
    firstOutputMs: 10_000,
    markerMs: 10_020,
    requests: 150,
    tree: null,
    ...overrides,
  }
}

describe('modelDownloadMs', () => {
  test('bandwidth plus round trips over 15 connections', () => {
    // 50 Mbit/s: 1 MB takes 160 ms; 150 requests × 40 ms / 15 = 400 ms
    expect(modelDownloadMs(1_000_000, 150)).toBe(560)
  })
})

describe('median', () => {
  test('odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })
})

describe('scoreEntry', () => {
  test('wait is measured time plus modeled download', () => {
    const tree = {bytes: 500, packageCount: 2, packages: {'a@1': 400, 'b@1': 100}}
    expect(scoreEntry([run({tree}), run({firstOutputMs: 12_000, markerMs: 12_030}), run()])).toEqual({
      bytesDownloaded: 1_000_000,
      largestPackages: [
        {bytes: 400, id: 'a@1'},
        {bytes: 100, id: 'b@1'},
      ],
      markerGapMs: 20,
      packages: 2,
      packagesBytes: 500,
      problems: [],
      waitMs: 10_560,
    })
  })

  test('flags runs that never reached the marker', () => {
    const result = scoreEntry([run(), run({end: 'timeout', markerMs: null})])
    expect(result.problems).toEqual(['1 of 2 runs never reached the marker'])
    expect(result.waitMs).toBe(10_560)
  })

  test('flags output printed long before the CLI is ready', () => {
    expect(scoreEntry([run({markerMs: 10_500})]).problems).toEqual([
      'first output came 500ms before the CLI was ready (max 250ms)',
    ])
  })

  test('has no wait without a complete run', () => {
    expect(scoreEntry([])).toMatchObject({bytesDownloaded: 0, markerGapMs: null, packages: null, waitMs: null})
  })
})

describe('scoreRuns', () => {
  test('averages both entry points', () => {
    const result = scoreRuns([run(), run({entry: 'npm-create-sanity', firstOutputMs: 20_000, markerMs: 20_020})])
    expect(result.score).toBe(15_560)
    expect(result.passed).toBe(true)
  })

  test('has no score when an entry point failed', () => {
    const result = scoreRuns([run()])
    expect(result.score).toBeNull()
    expect(result.passed).toBe(false)
  })
})
