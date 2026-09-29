import {type Check, type EntrySummary, formatBytes, type VariantSummary} from './compare.ts'
import {type BenchConfig, ENTRY_POINTS, type EntryPoint} from './config.ts'
import {type TreeDiff} from './tree.ts'

export const REPORT_MARKER = '<!-- cold-start-bench -->'

interface VariantInfo {
  /** Suffix of every bench version published for this variant */
  id: string
  /** What the user asked for, e.g. `main` or `working tree` */
  label: string
  sha: string | null
}

interface Environment {
  node: string
  npm: string
  os: string
}

export interface BenchResults {
  checks: Check[]
  config: BenchConfig
  environment: Environment
  scores: Record<string, number | null>
  summaries: Record<string, VariantSummary>
  treeDiffs: Partial<Record<EntryPoint, TreeDiff>>
  variants: Record<string, VariantInfo>
}

const COMMANDS: Record<EntryPoint, string> = {
  'npm-create-sanity': 'npm create sanity',
  'npx-sanity-init': 'npx sanity init',
}

const seconds = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? 'n/a' : `${(ms / 1000).toFixed(2)}s`

function delta(base: number | null | undefined, head: number | null | undefined, format: (n: number) => string) {
  if (base === null || base === undefined || head === null || head === undefined) return ''
  const diff = head - base
  if (diff === 0) return '0'
  const percent = base === 0 ? '' : ` (${diff > 0 ? '+' : ''}${((diff / base) * 100).toFixed(1)}%)`
  return `${diff > 0 ? '+' : '-'}${format(Math.abs(diff))}${percent}`
}

type Row = [label: string, value: (s: EntrySummary) => number | null | undefined, format: (n: number) => string]

const ROWS: Row[] = [
  ['First output (median)', (s) => s.firstOutput?.median, seconds],
  ['First output (p90)', (s) => s.firstOutput?.p90, seconds],
  ['Spread', (s) => s.firstOutput?.spread, seconds],
  ['First output → marker', (s) => s.markerGap?.median, (n) => `${Math.round(n)}ms`],
  ['Downloaded', (s) => s.wireBytesDown, formatBytes],
  ['Installed packages', (s) => s.packageCount, String],
  ['Installed size', (s) => s.packageBytes, formatBytes],
]

const STATUS_ICON: Record<Check['status'], string> = {fail: '❌', pass: '✅', warn: '⚠️'}

function variantLabel(info: VariantInfo) {
  return info.sha ? `${info.label} (${info.sha.slice(0, 7)})` : info.label
}

export function buildReport(results: BenchResults): string {
  const {base, head} = results.variants
  const lines: string[] = [REPORT_MARKER, '## Cold start: time to first `sanity init` output', '']

  const headScore = results.scores.head
  if (base) {
    const baseScore = results.scores.base
    lines.push(
      `**Score: ${seconds(headScore)}** (base ${seconds(baseScore)}, ${baseScore === headScore ? 'no change' : delta(baseScore, headScore, seconds)})`,
    )
  } else {
    lines.push(`**Score: ${seconds(headScore)}**`)
  }
  lines.push(
    '',
    'Weighted median time from typing the command to the CLI’s first output, with an empty npm cache over a simulated network. Lower is better.',
    '',
  )

  for (const entry of ENTRY_POINTS) {
    const headSummary = results.summaries.head[entry]
    const baseSummary = base ? results.summaries.base[entry] : undefined
    lines.push(`### \`${COMMANDS[entry]}\` (weight ${results.config.entries[entry].weight})`, '', base ? '| | Base | Head | Change |' : '| | Head |', base ? '|---|---|---|---|' : '|---|---|')
    for (const [label, value, format] of ROWS) {
      const headValue = value(headSummary)
      const formatted = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : format(v))
      if (baseSummary) {
        const baseValue = value(baseSummary)
        lines.push(`| ${label} | ${formatted(baseValue)} | ${formatted(headValue)} | ${delta(baseValue, headValue, format)} |`)
      } else {
        lines.push(`| ${label} | ${formatted(headValue)} |`)
      }
    }
    if (headSummary.failedRuns > 0) {
      lines.push('', `${headSummary.failedRuns} of ${headSummary.runs} head runs did not reach the marker.`)
    }

    const diff = results.treeDiffs[entry]
    if (diff && (diff.added.length > 0 || diff.removed.length > 0)) {
      lines.push('', '<details><summary>Largest package changes</summary>', '')
      for (const change of diff.added) lines.push(`- ➕ \`${change.id}\` ${formatBytes(change.bytes)}`)
      for (const change of diff.removed) lines.push(`- ➖ \`${change.id}\` ${formatBytes(change.bytes)}`)
      lines.push('', '</details>')
    }

    if (baseSummary && baseSummary.firstScreen !== headSummary.firstScreen) {
      lines.push(
        '',
        '<details><summary>Output up to the marker changed</summary>',
        '',
        'Base:',
        '```',
        baseSummary.firstScreen,
        '```',
        'Head:',
        '```',
        headSummary.firstScreen,
        '```',
        '',
        '</details>',
      )
    }
    lines.push('')
  }

  if (results.checks.length > 0) {
    lines.push('### Checks', '')
    for (const check of results.checks) {
      lines.push(`- ${STATUS_ICON[check.status]} \`${COMMANDS[check.entry]}\` ${check.name}: ${check.message}`)
    }
    lines.push('')
  }

  const {network} = results.config
  lines.push(
    '<details><summary>Setup</summary>',
    '',
    ...(base ? [`- Base: ${variantLabel(base)}`] : []),
    `- Head: ${variantLabel(head)}`,
    `- \`sanity@${results.config.sanityVersion}\` repacked around the CLI under test`,
    `- ${results.config.runs} runs per variant and entry point, interleaved`,
    `- Network: ${network.downMbps} Mbit/s down, ${network.upMbps} Mbit/s up, ${network.rttMs}ms round trip`,
    `- Node ${results.environment.node}, npm ${results.environment.npm}, ${results.environment.os}`,
    '',
    '</details>',
    '',
  )

  return lines.join('\n')
}
