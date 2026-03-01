/* eslint-disable no-console */
import {spawnSync} from 'node:child_process'
import {existsSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {format} from 'prettier'

import {type CoverageSummary, type FileDelta} from './types'

await main()

async function main(): Promise<void> {
  const currentSummaryPath = 'coverage/coverage-summary.json'
  const baselineSummaryPath = 'coverage/baseline/coverage-summary.json'
  const baselineShaPath = 'coverage/baseline/sha.txt'

  if (!existsSync(currentSummaryPath)) {
    console.error(`Coverage summary not found at ${currentSummaryPath}`)
    process.exit(1)
  }

  const current = parseCoverageSummary(currentSummaryPath)

  const hasBaseline = existsSync(baselineSummaryPath)
  const baseline = hasBaseline ? parseCoverageSummary(baselineSummaryPath) : null

  const baselineSha =
    hasBaseline && existsSync(baselineShaPath) ? readFileSync(baselineShaPath, 'utf8').trim() : null

  const changedFiles = getChangedFiles()
  const deltas = computeDeltas(current, baseline, changedFiles)
  const rawMarkdown = buildMarkdown(deltas, baseline, baselineSha)
  const formatted = await format(rawMarkdown, {parser: 'markdown'})

  const isPullRequest = process.env.GITHUB_EVENT_NAME === 'pull_request'
  if (isPullRequest) {
    await postComment(formatted)
  } else {
    // Local / dry-run: print to stdout instead of posting
    process.stdout.write(formatted)
  }
}

function isCoverageSummary(value: unknown): value is CoverageSummary {
  return typeof value === 'object' && value !== null && 'total' in value
}

function parseCoverageSummary(filePath: string): CoverageSummary {
  const raw: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
  if (!isCoverageSummary(raw)) {
    throw new Error(`Invalid coverage summary format in ${filePath}`)
  }
  return raw
}

function findCoverageKey(summary: CoverageSummary, relativePath: string): string | undefined {
  return Object.keys(summary).find(
    (key) => key !== 'total' && (key === relativePath || key.endsWith(`/${relativePath}`)),
  )
}

function getChangedFiles(): string[] {
  const result = spawnSync('git', ['diff', '--name-only', 'origin/main...HEAD'], {
    encoding: 'utf8',
  })
  return (result.stdout ?? '').trim().split('\n').filter(Boolean)
}

function computeDeltas(
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

function formatDelta(delta: number | null): string {
  if (delta === null) return 'new ↗'
  if (delta > 0) return `+${delta.toFixed(1)}% ↗`
  if (delta < 0) return `${delta.toFixed(1)}% ↘`
  return '±0% —'
}

function buildMarkdown(
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

async function postComment(body: string): Promise<void> {
  const tmpFile = join(tmpdir(), `coverage-delta-${Date.now()}.md`)
  writeFileSync(tmpFile, body)
  try {
    // Try to edit existing coverage comment, fall back to creating new one
    const edit = spawnSync('gh', ['pr', 'comment', '--edit-last', '--body-file', tmpFile], {
      encoding: 'utf8',
      stdio: 'inherit',
    })

    if (edit.status !== 0) {
      const create = spawnSync('gh', ['pr', 'comment', '--body-file', tmpFile], {
        encoding: 'utf8',
        stdio: 'inherit',
      })
      if (create.status !== 0) {
        throw new Error(
          `Failed to post coverage comment: gh exited with status ${create.status ?? 'unknown'}`,
        )
      }
    }
  } finally {
    unlinkSync(tmpFile)
  }
}
