import {describe, expect, test} from 'vitest'

import {type EntrySummary, type VariantSummary} from '../compare.ts'
import {parseConfig} from '../config.ts'
import {type BenchResults, buildReport, REPORT_MARKER} from '../report.ts'
import {summarize} from '../stats.ts'

const config = parseConfig({
  entries: {'npm-create-sanity': {weight: 0.5}, 'npx-sanity-init': {weight: 0.5}},
  marker: 'Fetching providers',
  network: {downMbps: 50, rttMs: 40, upMbps: 10},
  runs: 3,
  sanityVersion: '6.13.2',
  thresholds: {
    markerGapIncreaseMs: 250,
    packageCountIncrease: 0,
    timeRegressionMinMs: 1000,
    timeRegressionSpreads: 3,
    wireBytesIncreasePercent: 1,
  },
  timeoutMs: 240_000,
})

function entry(firstOutput: number[], overrides: Partial<EntrySummary> = {}): EntrySummary {
  return {
    failedRuns: 0,
    firstOutput: summarize(firstOutput),
    firstScreen: 'Warning\nFetching providers',
    markerGap: summarize([20]),
    packageBytes: 300 * 1024 * 1024,
    packageCount: 900,
    runs: firstOutput.length,
    wireBytesDown: 80 * 1024 * 1024,
    ...overrides,
  }
}

function variant(ms: number[], overrides: Partial<EntrySummary> = {}): VariantSummary {
  return {'npm-create-sanity': entry(ms, overrides), 'npx-sanity-init': entry(ms, overrides)}
}

const environment = {node: 'v24.11.1', npm: '11.6.2', os: 'linux x64'}

describe('buildReport', () => {
  test('compares base and head', () => {
    const results: BenchResults = {
      checks: [
        {entry: 'npx-sanity-init', message: '850 packages (-50)', name: 'package-count', status: 'pass'},
        {entry: 'npm-create-sanity', message: 'differs', name: 'first-screen', status: 'warn'},
        {entry: 'npm-create-sanity', message: 'slower', name: 'first-output', status: 'fail'},
      ],
      config,
      environment,
      scores: {base: 30_000, head: 25_000},
      summaries: {
        base: variant([30_000, 31_000, 29_000]),
        head: {
          'npm-create-sanity': entry([25_000], {firstScreen: 'Changed\nFetching providers'}),
          'npx-sanity-init': entry([25_000], {packageCount: 850}),
        },
      },
      treeDiffs: {
        'npx-sanity-init': {
          added: [{bytes: 2048, id: 'new@1.0.0'}],
          removed: [{bytes: 4096, id: 'old@1.0.0'}],
        },
      },
      variants: {
        base: {id: 'abc1234', label: 'main', sha: 'abc1234def'},
        head: {id: 'wt123', label: 'working tree', sha: null},
      },
    }

    const report = buildReport(results)
    expect(report.startsWith(REPORT_MARKER)).toBe(true)
    expect(report).toContain('**Score: 25.00s** (base 30.00s, -5.00s (-16.7%))')
    expect(report).toContain('| First output (median) | 30.00s | 25.00s | -5.00s (-16.7%) |')
    expect(report).toContain('| Installed packages | 900 | 850 | -50 (-5.6%) |')
    expect(report).toContain('| Downloaded | 80.0 MB | 80.0 MB | 0 |')
    expect(report).toContain('- ➕ `new@1.0.0` 2.0 KB')
    expect(report).toContain('- ➖ `old@1.0.0` 4.0 KB')
    expect(report).toContain('Output up to the marker changed')
    expect(report).toContain('- ✅ `npx sanity init` package-count: 850 packages (-50)')
    expect(report).toContain('- ⚠️ `npm create sanity` first-screen: differs')
    expect(report).toContain('- ❌ `npm create sanity` first-output: slower')
    expect(report).toContain('- Base: main (abc1234)')
    expect(report).toContain('- Head: working tree')
    expect(report).toContain('- Network: 50 Mbit/s down, 10 Mbit/s up, 40ms round trip')
  })

  test('reports head alone', () => {
    const report = buildReport({
      checks: [],
      config,
      environment,
      scores: {head: null},
      summaries: {
        head: variant([25_000], {
          failedRuns: 1,
          firstOutput: null,
          markerGap: null,
          packageBytes: null,
          packageCount: null,
        }),
      },
      treeDiffs: {},
      variants: {head: {id: 'x', label: 'HEAD', sha: 'fedcba9876'}},
    })

    expect(report).toContain('**Score: n/a**')
    expect(report).toContain('| First output (median) | n/a |')
    expect(report).toContain('1 of 1 head runs did not reach the marker.')
    expect(report).not.toContain('### Checks')
    expect(report).not.toContain('- Base:')
  })

  test('says when the score did not change', () => {
    const report = buildReport({
      checks: [],
      config,
      environment,
      scores: {base: 1000, head: 1000},
      summaries: {base: variant([1000]), head: variant([1000])},
      treeDiffs: {'npx-sanity-init': {added: [], removed: []}},
      variants: {
        base: {id: 'a', label: 'main', sha: null},
        head: {id: 'b', label: 'HEAD', sha: null},
      },
    })
    expect(report).toContain('(base 1.00s, no change)')
    expect(report).not.toContain('Largest package changes')
  })
})
