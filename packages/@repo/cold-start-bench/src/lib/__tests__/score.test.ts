import {describe, expect, test} from 'vitest'

import {median, modelDownloadMs, type ScoredRun, scoreEntry} from '../score.ts'

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
    expect(
      scoreEntry([run({tree}), run({firstOutputMs: 12_000, markerMs: 12_030}), run()]),
    ).toEqual({
      bytesDownloaded: 1_000_000,
      largestPackages: [
        {bytes: 400, id: 'a@1'},
        {bytes: 100, id: 'b@1'},
      ],
      markerGapMs: 20,
      modeledUsableInteractionMs: 10_580,
      packages: 2,
      packagesBytes: 500,
      problems: [],
      usableInteractionMs: 10_020,
    })
  })

  test('flags runs that never reached the marker', () => {
    const result = scoreEntry([run(), run({end: 'timeout', markerMs: null})])
    expect(result.problems).toEqual(['1 of 2 runs never reached the marker'])
    expect(result.modeledUsableInteractionMs).toBe(10_580)
  })

  test('scores readiness even when an early banner precedes it', () => {
    expect(scoreEntry([run({firstOutputMs: 1, markerMs: 10_500})])).toMatchObject({
      markerGapMs: 10_499,
      modeledUsableInteractionMs: 11_060,
      problems: [],
    })
  })

  test('has no wait without a complete run', () => {
    expect(scoreEntry([])).toMatchObject({
      bytesDownloaded: 0,
      markerGapMs: null,
      modeledUsableInteractionMs: null,
      packages: null,
    })
  })
})
