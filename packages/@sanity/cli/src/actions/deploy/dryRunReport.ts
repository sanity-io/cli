import {styleText} from 'node:util'

import {type Output} from '@sanity/cli-core'

import {type DeployCheck, type DeployCheckStatus, type DeployTarget} from './deployChecks.js'
import {type DeployFileSummary} from './listDeploymentFiles.js'

export interface DryRunReport {
  checks: DeployCheck[]
  deployable: boolean
  dryRun: true
  files: DeployFileSummary | null
  target: DeployTarget | null
}

export function isDeployable(checks: DeployCheck[]): boolean {
  return checks.every((check) => check.status !== 'fail')
}

const checkIcon: Record<DeployCheckStatus, string> = {
  fail: styleText('red', '✗'),
  pass: styleText('green', '✓'),
  skip: styleText('gray', '○'),
  warn: styleText('yellow', '⚠'),
}

const MAX_FILES_LISTED = 20

export function renderDryRunReport(report: DryRunReport, output: Output): void {
  output.log('')
  for (const check of report.checks) {
    // Indent multi-line messages (e.g. schema validation output) under the icon
    output.log(`${checkIcon[check.status]} ${check.message.replaceAll('\n', '\n  ')}`)
  }

  if (report.files) {
    const {count, list, totalBytes} = report.files
    output.log('')
    output.log(
      `Would upload ${count} ${count === 1 ? 'file' : 'files'} (${formatBytes(totalBytes)}):`,
    )
    for (const file of list.slice(0, MAX_FILES_LISTED)) {
      output.log(`  ${file.path} ${styleText('gray', formatBytes(file.size))}`)
    }
    if (count > MAX_FILES_LISTED) {
      output.log(styleText('gray', `  … and ${count - MAX_FILES_LISTED} more`))
    }
  }

  output.log('')
  if (report.deployable) {
    output.log(
      `${styleText('green', 'Ready to deploy.')} ${styleText('gray', 'Dry run — nothing was deployed.')}`,
    )
  } else {
    const failed = report.checks.filter((check) => check.status === 'fail').length
    output.log(
      `${styleText('red', `Not deployable — ${failed} ${failed === 1 ? 'check' : 'checks'} failed.`)} ${styleText('gray', 'Dry run — nothing was deployed.')}`,
    )
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1000) {
    return `${bytes} B`
  }

  let value = bytes
  let unit = 'B'
  for (const next of ['kB', 'MB', 'GB']) {
    if (value < 1000) break
    value /= 1000
    unit = next
  }

  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${unit}`
}
