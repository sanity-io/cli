import {readdir, stat} from 'node:fs/promises'
import {join, relative, sep} from 'node:path'
import {styleText} from 'node:util'

import {type Output} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'

import {type DeployCheck} from './deployChecks.js'

export interface DeploymentFile {
  /** Path relative to the project root, POSIX-style. */
  path: string
  size: number
}

/** What a `--dry-run` deploy would do: the real deploy sequence with every mutation gated off. */
export interface DeploymentPlan {
  checks: DeployCheck[]
  files: DeploymentFile[]
  type: 'coreApp' | 'studio'
}

/**
 * Lists the files a deploy would pack from `sourceDir`, as paths relative to
 * `fromDir`. A missing directory yields an empty list rather than throwing.
 */
export async function listDeploymentFiles(
  sourceDir: string,
  fromDir: string,
): Promise<DeploymentFile[]> {
  const walk = async (dir: string): Promise<string[]> => {
    let entries
    try {
      entries = await readdir(dir, {withFileTypes: true})
    } catch {
      return []
    }
    const nested = await Promise.all(
      entries.map((entry) => {
        const full = join(dir, entry.name)
        return entry.isDirectory() ? walk(full) : Promise.resolve([full])
      }),
    )
    return nested.flat()
  }

  const absolute = await walk(sourceDir)
  const files = await Promise.all(
    absolute.map(async (file) => ({
      // Deploy paths are POSIX-style regardless of the host OS (Windows gives `\`).
      path: relative(fromDir, file).split(sep).join('/'),
      size: (await stat(file)).size,
    })),
  )
  return files.toSorted((a, b) => a.path.localeCompare(b.path))
}

export function renderDeploymentPlan(plan: DeploymentPlan, output: Output): void {
  const label = plan.type === 'coreApp' ? 'application' : 'studio'
  const problems = plan.checks.filter((check) => check.status === 'fail')
  const warnings = plan.checks.filter((check) => check.status === 'warn')
  const totalBytes = plan.files.reduce((sum, file) => sum + file.size, 0)

  output.log('\nDry run — no changes made.\n')

  // Only pass/skip here; problems and warnings render below with their fixes.
  for (const check of plan.checks) {
    if (check.status === 'pass' || check.status === 'skip') {
      output.log(`  ${statusIcon(check.status)} ${check.message}`)
    }
  }

  output.log(
    problems.length === 0
      ? styleText('green', `\nThis ${label} can be deployed.`)
      : styleText('red', `\nThis ${label} can't be deployed.`),
  )

  renderIssues(output, 'Problems to fix:', problems)
  renderIssues(output, 'Warnings:', warnings)

  output.log(`\nFiles to deploy (${formatMB(totalBytes)}):`)
  for (const file of plan.files) {
    output.log(`  ${file.path} (${formatMB(file.size)})`)
  }
}

function renderIssues(output: Output, title: string, checks: DeployCheck[]): void {
  if (checks.length === 0) return

  output.log(`\n${title}`)
  for (const check of checks) {
    const fix = check.solution ? `: ${check.solution}` : ''
    output.log(`  ${statusIcon(check.status)} ${check.message}${fix}`)
  }
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function statusIcon(status: DeployCheck['status']): string {
  switch (status) {
    case 'fail': {
      return logSymbols.error
    }
    case 'skip': {
      return logSymbols.info
    }
    case 'warn': {
      return logSymbols.warning
    }
    default: {
      return logSymbols.success
    }
  }
}
