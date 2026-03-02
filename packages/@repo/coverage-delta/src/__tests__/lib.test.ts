import {describe, expect, test} from 'vitest'

import {
  buildMarkdown,
  computeDeltas,
  findCoverageKey,
  formatDelta,
  isCoverageSummary,
} from '../lib.ts'
import {type CoverageSummary} from '../types.ts'

const metric = (pct: number) => ({covered: 0, pct, skipped: 0, total: 0})
const fileData = (pct: number) => ({
  branches: metric(pct),
  functions: metric(pct),
  lines: metric(pct),
  statements: metric(pct),
})

describe('isCoverageSummary', () => {
  test('returns true for valid summary', () => {
    expect(isCoverageSummary({total: fileData(100)})).toBe(true)
  })

  test('returns false for null', () => {
    expect(isCoverageSummary(null)).toBe(false)
  })

  test('returns false for non-object', () => {
    expect(isCoverageSummary('string')).toBe(false)
  })

  test('returns false for object without total', () => {
    expect(isCoverageSummary({foo: 'bar'})).toBe(false)
  })

  test('returns false when total is null', () => {
    expect(isCoverageSummary({total: null})).toBe(false)
  })

  test('returns false when total is a string', () => {
    expect(isCoverageSummary({total: 'string'})).toBe(false)
  })

  test('returns false when total is missing metric fields', () => {
    expect(isCoverageSummary({total: {statements: {pct: 80}}})).toBe(false)
  })

  test('returns false when pct is not a number', () => {
    expect(
      isCoverageSummary({
        total: {
          branches: {pct: 80},
          functions: {pct: 80},
          lines: {pct: 80},
          statements: {pct: 'not a number'},
        },
      }),
    ).toBe(false)
  })
})

describe('findCoverageKey', () => {
  const summary: CoverageSummary = {
    '/abs/path/src/foo.ts': fileData(80),
    'src/bar.ts': fileData(90),
    total: fileData(85),
  }

  test('matches exact key', () => {
    expect(findCoverageKey(summary, 'src/bar.ts')).toBe('src/bar.ts')
  })

  test('matches by suffix', () => {
    expect(findCoverageKey(summary, 'src/foo.ts')).toBe('/abs/path/src/foo.ts')
  })

  test('returns undefined for missing file', () => {
    expect(findCoverageKey(summary, 'src/missing.ts')).toBeUndefined()
  })

  test('never matches total', () => {
    expect(findCoverageKey(summary, 'total')).toBeUndefined()
  })
})

describe('computeDeltas', () => {
  const current: CoverageSummary = {
    'src/a.ts': fileData(85),
    'src/b.ts': fileData(70),
    total: fileData(80),
  }

  const baseline: CoverageSummary = {
    'src/a.ts': fileData(80),
    total: fileData(80),
  }

  test('computes delta for file present in both', () => {
    const deltas = computeDeltas(current, baseline, ['src/a.ts'])
    expect(deltas).toEqual([{baseline: 80, current: 85, delta: 5, displayName: 'src/a.ts'}])
  })

  test('marks file as new when missing from baseline', () => {
    const deltas = computeDeltas(current, baseline, ['src/b.ts'])
    expect(deltas).toEqual([{baseline: null, current: 70, delta: null, displayName: 'src/b.ts'}])
  })

  test('skips files not in coverage scope', () => {
    const deltas = computeDeltas(current, baseline, ['src/unknown.ts'])
    expect(deltas).toEqual([])
  })

  test('works without baseline', () => {
    const deltas = computeDeltas(current, null, ['src/a.ts'])
    expect(deltas).toEqual([{baseline: null, current: 85, delta: null, displayName: 'src/a.ts'}])
  })

  test('handles multiple changed files', () => {
    const deltas = computeDeltas(current, baseline, ['src/a.ts', 'src/b.ts'])
    expect(deltas).toHaveLength(2)
    expect(deltas[0].displayName).toBe('src/a.ts')
    expect(deltas[1].displayName).toBe('src/b.ts')
  })
})

describe('formatDelta', () => {
  test('formats null as new', () => {
    expect(formatDelta(null)).toBe('new ↗')
  })

  test('formats positive delta', () => {
    expect(formatDelta(2.5)).toBe('+2.5% ↗')
  })

  test('formats negative delta', () => {
    expect(formatDelta(-3.2)).toBe('-3.2% ↘')
  })

  test('formats zero delta', () => {
    expect(formatDelta(0)).toBe('±0% —')
  })
})

describe('buildMarkdown', () => {
  const baseline: CoverageSummary = {
    'src/a.ts': fileData(80),
    total: fileData(80),
  }

  test('returns empty message when no deltas', () => {
    const md = buildMarkdown([], baseline, 'abc123')
    expect(md).toContain('No covered files changed')
  })

  test('includes delta column when baseline exists', () => {
    const deltas = [{baseline: 80, current: 85, delta: 5, displayName: 'src/a.ts'}]
    const md = buildMarkdown(deltas, baseline, 'abc123')
    expect(md).toContain('| File | Stmts | Delta |')
    expect(md).toContain('src/a.ts')
    expect(md).toContain('80.0% → 85.0%')
    expect(md).toContain('+5.0% ↗')
    expect(md).toContain('abc123')
  })

  test('omits delta column when no baseline', () => {
    const deltas = [{baseline: null, current: 70, delta: null, displayName: 'src/b.ts'}]
    const md = buildMarkdown(deltas, null, null)
    expect(md).not.toContain('| Delta |')
    expect(md).toContain('| File | Stmts |')
    expect(md).toContain('new → 70.0%')
    expect(md).toContain('No baseline available')
  })

  test('uses singular "file" for single delta', () => {
    const deltas = [{baseline: 80, current: 85, delta: 5, displayName: 'src/a.ts'}]
    const md = buildMarkdown(deltas, baseline, 'abc123')
    expect(md).toContain('1 changed file')
  })

  test('uses plural "files" for multiple deltas', () => {
    const deltas = [
      {baseline: 80, current: 85, delta: 5, displayName: 'src/a.ts'},
      {baseline: null, current: 70, delta: null, displayName: 'src/b.ts'},
    ]
    const md = buildMarkdown(deltas, baseline, 'abc123')
    expect(md).toContain('2 changed files')
  })
})
