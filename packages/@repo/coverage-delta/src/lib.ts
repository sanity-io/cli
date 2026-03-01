import {readFileSync} from 'node:fs'

import {type CoverageSummary, type FileDelta} from './types.ts'

export function isCoverageSummary(value: unknown): value is CoverageSummary {
  return typeof value === 'object' && value !== null && 'total' in value
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
  if (delta === null) return 'new ↗'
  if (delta > 0) return `+${delta.toFixed(1)}% ↗`
  if (delta < 0) return `${delta.toFixed(1)}% ↘`
  return '±0% —'
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

  const headerRow = hasBaseline ? '| File | Coverage | Delta |' : '| File | Coverage |'
  const separatorRow = hasBaseline ? '| ---- | -------- | ----- |' : '| ---- | -------- |'

  const rows = deltas.map(({baseline, current, delta, displayName}) => {
    const coverage =
      baseline === null
        ? `new → ${current.toFixed(1)}%`
        : `${baseline.toFixed(1)}% → ${current.toFixed(1)}%`

    return hasBaseline
      ? `| ${displayName} | ${coverage} | ${formatDelta(delta)} |`
      : `| ${displayName} | ${coverage} |`
  })

  const count = deltas.length
  const fileWord = count === 1 ? 'file' : 'files'
  const footer = hasBaseline
    ? `_Comparing ${count} changed ${fileWord} against main @ \`${baselineSha}\`_`
    : `_No baseline available — showing current coverage for ${count} changed ${fileWord}_`

  return `## Coverage Delta\n\n${headerRow}\n${separatorRow}\n${rows.join('\n')}\n\n${footer}\n`
}
