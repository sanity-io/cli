import {readFileSync} from 'node:fs'

import {type CoverageSummary, type FileDelta} from './types.ts'

function isCoverageMetric(value: unknown): value is {pct: number} {
  return typeof value === 'object' && value !== null && 'pct' in value && typeof value.pct === 'number'
}

function isFileCoverageData(
  value: unknown,
): value is {branches: {pct: number}; functions: {pct: number}; lines: {pct: number}; statements: {pct: number}} {
  if (typeof value !== 'object' || value === null) return false
  return (
    'statements' in value &&
    isCoverageMetric(value.statements) &&
    'branches' in value &&
    isCoverageMetric(value.branches) &&
    'functions' in value &&
    isCoverageMetric(value.functions) &&
    'lines' in value &&
    isCoverageMetric(value.lines)
  )
}

export function isCoverageSummary(value: unknown): value is CoverageSummary {
  return typeof value === 'object' && value !== null && 'total' in value && isFileCoverageData(value.total)
}

export function parseCoverageSummary(filePath: string): CoverageSummary {
  const raw: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
  if (!isCoverageSummary(raw)) {
    throw new Error(`Invalid coverage summary format in ${filePath}`)
  }
  return raw
}

export function findCoverageKey(
  summary: CoverageSummary,
  relativePath: string,
): string | undefined {
  return Object.keys(summary).find(
    (key) => key !== 'total' && (key === relativePath || key.endsWith(`/${relativePath}`)),
  )
}

export function computeDeltas(
  current: CoverageSummary,
  baseline: CoverageSummary | null,
  changedFiles: string[],
): FileDelta[] {
  const deltas: FileDelta[] = []

  for (const file of changedFiles) {
    const currentKey = findCoverageKey(current, file)
    if (!currentKey) continue // file not in coverage scope, skip

    const currentPct = current[currentKey].statements.pct

    let baselinePct: number | null = null
    if (baseline) {
      const baselineKey = findCoverageKey(baseline, file)
      baselinePct = baselineKey ? baseline[baselineKey].statements.pct : null
    }

    deltas.push({
      baseline: baselinePct,
      current: currentPct,
      delta: baselinePct === null ? null : currentPct - baselinePct,
      displayName: file,
    })
  }

  return deltas
}

export function formatDelta(delta: number | null): string {
  if (delta === null) return '<font color="green">(new)</font>'
  if (delta > 0) return `<font color="green">(+&nbsp;${delta.toFixed(1)}%)</font>`
  if (delta < 0) return `<font color="red">(-&nbsp;${Math.abs(delta).toFixed(1)}%)</font>`
  return '<font color="green">(±0%)</font>'
}

export function buildMarkdown(
  deltas: FileDelta[],
  baseline: CoverageSummary | null,
  baselineSha: string | null,
): string {
  if (deltas.length === 0) {
    return '## Coverage Delta\n\nNo covered files changed in this PR.\n'
  }

  const hasBaseline = baseline !== null

  const headerRow = '| File | Statements |'
  const separatorRow = '| ---- | ---- |'

  const rows = deltas.map(({current, delta, displayName}) => {
    const pct = `${current.toFixed(1)}%`
    const cell = hasBaseline ? `${pct}&nbsp;${formatDelta(delta)}` : pct
    return `| ${displayName} | ${cell} |`
  })

  const count = deltas.length
  const fileWord = count === 1 ? 'file' : 'files'
  const footer = hasBaseline
    ? `_Comparing ${count} changed ${fileWord} against main @ \`${baselineSha}\`_`
    : `_No baseline available — showing current coverage for ${count} changed ${fileWord}_`

  return `## Coverage Delta\n\n${headerRow}\n${separatorRow}\n${rows.join('\n')}\n\n${footer}\n`
}
