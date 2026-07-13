import {readdir, stat} from 'node:fs/promises'
import {join, relative, sep} from 'node:path'
import {styleText} from 'node:util'

import {type Output} from '@sanity/cli-core'
import {type DeployedExpose, summarizeExposes} from '@sanity/workbench-cli/deploy'

import {checkStatusIcon, nestLines, renderIssues} from '../../util/checks.js'
import {pluralize} from '../../util/pluralize.js'
import {type DeployCheck, type DeployCheckReporter, type DeployTarget} from './deployChecks.js'

export interface DeploymentFile {
  /** Path relative to the project root, POSIX-style. */
  path: string
  size: number
}

/** What a `--dry-run` deploy would do: the real deploy sequence with every mutation gated off. */
export interface DeploymentPlan {
  checks: DeployCheck[]
  /** Media-library config summary; `null` unless a config deploys. */
  config: string | null
  /** Workbench views and services registered with the deploy. */
  exposes: DeployedExpose[]
  files: DeploymentFile[]
  /** The resolved deploy target; `null` when the checks can't determine one. */
  target: DeployTarget | null
  type: 'coreApp' | 'studio'
  /** Installed framework version the deploy would use; `null` when not found. */
  version: string | null

  /** The app's explicit `isSingleton` flag; `undefined` when the app doesn't set it. */
  isSingleton?: boolean
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

export function isDeployable(plan: DeploymentPlan): boolean {
  return plan.checks.every((check) => check.status !== 'fail')
}

function totalBytes(files: DeploymentFile[]): number {
  return files.reduce((sum, file) => sum + file.size, 0)
}

/**
 * A problem-focused, machine-readable projection of the plan: blocking problems
 * mapped to their fix, warnings as messages. Derived from the same checks the
 * human report renders (its pass/skip lines are informational and omitted here).
 */
export function deploymentPlanToJson(plan: DeploymentPlan): {
  applicationType: DeploymentPlan['type']
  applicationVersion: string | null
  config?: string
  errors: Record<string, string | null>
  exposes?: DeployedExpose[]
  files: DeploymentFile[]
  isDeployable: boolean
  isSingleton?: boolean
  target: DeployTarget | null
  totalBytes: number
  warnings: string[]
} {
  const errors: Record<string, string | null> = {}
  const warnings: string[] = []
  for (const check of plan.checks) {
    if (check.status === 'fail') errors[check.message] = check.solution ?? null
    else if (check.status === 'warn') warnings.push(check.message)
  }

  // `exposes`, `config` and `isSingleton` are workbench-only; plain
  // apps (and apps that don't set the flag) omit them.
  return {
    applicationType: plan.type,
    applicationVersion: plan.version,
    errors,
    ...(plan.exposes.length > 0 ? {exposes: plan.exposes} : {}),
    files: plan.files,
    ...(plan.config ? {config: plan.config} : {}),
    isDeployable: isDeployable(plan),
    ...(plan.isSingleton === undefined ? {} : {isSingleton: plan.isSingleton}),
    target: plan.target,
    totalBytes: totalBytes(plan.files),
    warnings,
  }
}

/**
 * Reports an app's exposes as pass checks and returns them structured for the
 * `--json` payload. The structured list rides on the first check so a dry run's
 * collector can read it back.
 */
export function reportExposes(
  reporter: DeployCheckReporter,
  app: Parameters<typeof summarizeExposes>[0],
): DeployedExpose[] {
  const {exposes, lines} = summarizeExposes(app)
  for (const [index, message] of lines.entries()) {
    reporter.report({exposes: index === 0 ? exposes : undefined, message, status: 'pass'})
  }
  return exposes
}

export function renderDeploymentPlan(plan: DeploymentPlan, output: Output): void {
  const label = plan.type === 'coreApp' ? 'application' : 'studio'
  const problems = plan.checks.filter((check) => check.status === 'fail')
  const warnings = plan.checks.filter((check) => check.status === 'warn')

  output.log('\nDry run — no changes made.\n')

  // Only pass/skip here; problems and warnings render below with their fixes.
  for (const check of plan.checks) {
    if (check.status === 'pass' || check.status === 'skip') {
      output.log(nestLines(`  ${checkStatusIcon(check.status)} ${check.message}`))
    }
  }

  output.log(
    isDeployable(plan)
      ? styleText('green', `\nThis ${label} can be deployed.`)
      : styleText('red', `\nThis ${label} can't be deployed.`),
  )

  renderIssues(output, 'Problems to fix:', problems)
  renderIssues(output, 'Warnings:', warnings)

  // A blocked deploy uploads nothing, so only list files for a deployable plan.
  if (isDeployable(plan) && plan.files.length > 0) {
    output.log(
      `\nFiles to deploy (${plan.files.length} ${pluralize('file', plan.files.length)}, ${formatMB(totalBytes(plan.files))}):`,
    )
    for (const file of plan.files) {
      output.log(`  ${file.path} (${formatMB(file.size)})`)
    }
  }
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
