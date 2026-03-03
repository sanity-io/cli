import {describe, expect, test} from 'vitest'

import {
  buildMarkdown,
  buildOverallCoverage,
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
    expect(formatDelta(null)).toBe('<font color="green">(new)</font>')
  })

  test('formats positive delta', () => {
    expect(formatDelta(2.5)).toBe('<font color="green">(+&nbsp;2.5%)</font>')
  })

  test('formats negative delta', () => {
    expect(formatDelta(-3.2)).toBe('<font color="red">(-&nbsp;3.2%)</font>')
  })

  test('formats zero delta', () => {
    expect(formatDelta(0)).toBe('<font color="green">(±0%)</font>')
  })
})

describe('buildOverallCoverage', () => {
  test('renders all four metrics with deltas when baseline exists', () => {
    const current: CoverageSummary = {total: fileData(85)}
    const baseline: CoverageSummary = {total: fileData(80)}
    const md = buildOverallCoverage(current, baseline)

    expect(md).toContain('### Overall Coverage')
    expect(md).toContain('| Metric | Coverage |')
    expect(md).toContain('| Statements | 85.0%&nbsp;<font color="green">(+&nbsp;5.0%)</font> |')
    expect(md).toContain('| Branches | 85.0%&nbsp;<font color="green">(+&nbsp;5.0%)</font> |')
    expect(md).toContain('| Functions | 85.0%&nbsp;<font color="green">(+&nbsp;5.0%)</font> |')
    expect(md).toContain('| Lines | 85.0%&nbsp;<font color="green">(+&nbsp;5.0%)</font> |')
  })

  test('renders only percentages when no baseline', () => {
    const current: CoverageSummary = {total: fileData(75)}
    const md = buildOverallCoverage(current, null)

    expect(md).toContain('| Statements | 75.0% |')
    expect(md).toContain('| Branches | 75.0% |')
    expect(md).toContain('| Functions | 75.0% |')
    expect(md).toContain('| Lines | 75.0% |')
  })

  test('renders negative deltas', () => {
    const current: CoverageSummary = {total: fileData(70)}
    const baseline: CoverageSummary = {total: fileData(80)}
    const md = buildOverallCoverage(current, baseline)

    expect(md).toContain('| Statements | 70.0%&nbsp;<font color="red">(-&nbsp;10.0%)</font> |')
  })

  test('renders zero deltas', () => {
    const current: CoverageSummary = {total: fileData(80)}
    const baseline: CoverageSummary = {total: fileData(80)}
    const md = buildOverallCoverage(current, baseline)

    expect(md).toContain('| Statements | 80.0%&nbsp;<font color="green">(±0%)</font> |')
  })

  test('handles mixed metric values', () => {
    const current: CoverageSummary = {
      total: {
        branches: metric(60),
        functions: metric(90),
        lines: metric(82),
        statements: metric(85),
      },
    }
    const baseline: CoverageSummary = {
      total: {
        branches: metric(65),
        functions: metric(85),
        lines: metric(80),
        statements: metric(80),
      },
    }
    const md = buildOverallCoverage(current, baseline)

    expect(md).toContain('| Statements | 85.0%&nbsp;<font color="green">(+&nbsp;5.0%)</font> |')
    expect(md).toContain('| Branches | 60.0%&nbsp;<font color="red">(-&nbsp;5.0%)</font> |')
    expect(md).toContain('| Functions | 90.0%&nbsp;<font color="green">(+&nbsp;5.0%)</font> |')
    expect(md).toContain('| Lines | 82.0%&nbsp;<font color="green">(+&nbsp;2.0%)</font> |')
  })
})

describe('buildMarkdown', () => {
  const current: CoverageSummary = {
    'src/a.ts': fileData(85),
    'src/b.ts': fileData(70),
    total: fileData(82),
  }

  const baseline: CoverageSummary = {
    'src/a.ts': fileData(80),
    total: fileData(80),
  }

  test('returns empty message when no deltas and includes overall coverage', () => {
    const md = buildMarkdown([], current, baseline, 'abc123')
    expect(md).toContain('No covered files changed')
    expect(md).toContain('### Overall Coverage')
    expect(md).toContain('| Statements |')
  })

  test('includes delta in statements column when baseline exists', () => {
    const deltas = [{baseline: 80, current: 85, delta: 5, displayName: 'src/a.ts'}]
    const md = buildMarkdown(deltas, current, baseline, 'abc123')
    expect(md).toContain('| File | Statements |')
    expect(md).toContain('src/a.ts')
    expect(md).toContain('85.0%&nbsp;<font color="green">(+&nbsp;5.0%)</font>')
    expect(md).toContain('abc123')
  })

  test('shows only percentage when no baseline', () => {
    const noBaselineCurrent: CoverageSummary = {
      'src/b.ts': fileData(70),
      total: fileData(70),
    }
    const deltas = [{baseline: null, current: 70, delta: null, displayName: 'src/b.ts'}]
    const md = buildMarkdown(deltas, noBaselineCurrent, null, null)
    expect(md).toContain('| File | Statements |')
    expect(md).toContain('| src/b.ts | 70.0% |')
    expect(md).toContain('No baseline available')
  })

  test('uses singular "file" for single delta', () => {
    const deltas = [{baseline: 80, current: 85, delta: 5, displayName: 'src/a.ts'}]
    const md = buildMarkdown(deltas, current, baseline, 'abc123')
    expect(md).toContain('1 changed file')
  })

  test('uses plural "files" for multiple deltas', () => {
    const deltas = [
      {baseline: 80, current: 85, delta: 5, displayName: 'src/a.ts'},
      {baseline: null, current: 70, delta: null, displayName: 'src/b.ts'},
    ]
    const md = buildMarkdown(deltas, current, baseline, 'abc123')
    expect(md).toContain('2 changed files')
  })

  test('includes overall coverage section at the bottom', () => {
    const deltas = [{baseline: 80, current: 85, delta: 5, displayName: 'src/a.ts'}]
    const md = buildMarkdown(deltas, current, baseline, 'abc123')
    const deltaTableIdx = md.indexOf('| File | Statements |')
    const overallIdx = md.indexOf('### Overall Coverage')
    expect(overallIdx).toBeGreaterThan(deltaTableIdx)
  })

  test('overall section shows deltas when baseline exists', () => {
    const deltas = [{baseline: 80, current: 85, delta: 5, displayName: 'src/a.ts'}]
    const md = buildMarkdown(deltas, current, baseline, 'abc123')
    expect(md).toContain('### Overall Coverage')
    expect(md).toContain('| Statements | 82.0%&nbsp;<font color="green">(+&nbsp;2.0%)</font> |')
  })

  test('overall section shows only percentages when no baseline', () => {
    const noBaselineCurrent: CoverageSummary = {total: fileData(75)}
    const deltas = [{baseline: null, current: 75, delta: null, displayName: 'src/a.ts'}]
    const md = buildMarkdown(deltas, noBaselineCurrent, null, null)
    expect(md).toContain('### Overall Coverage')
    expect(md).toContain('| Statements | 75.0% |')
  })
})
