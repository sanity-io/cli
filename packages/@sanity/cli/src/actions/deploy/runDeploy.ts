// The deploy engine: an adapter supplies the two flows (read-only `plan`,
// mutating `deploy`) and runDeploy picks one from the flags and handles all
// `--dry-run`/`--json` mode concerns, so adapters never branch on mode.

import {readdir, stat} from 'node:fs/promises'
import {join, relative, sep} from 'node:path'
import {format, styleText} from 'node:util'

import {CLIError} from '@oclif/core/errors'
import {type Output} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {type DeployedExpose} from '@sanity/workbench-cli/deploy'

import {getErrorMessage} from '../../util/getErrorMessage.js'
import {pluralize} from '../../util/pluralize.js'
import {type DeployCheck, type DeployTarget} from './checks.js'
import {deployDebug} from './deployDebug.js'
import {type DeployAppOptions} from './types.js'

export type DeployedApplicationType = 'coreApp' | 'studio'

/**
 * One kind of deploy — plain studio, plain app, workbench studio, workbench
 * app — as the two flows the command can run. The generic ties an adapter's
 * plans and results to its application type.
 */
export interface DeployAdapter<T extends DeployedApplicationType = DeployedApplicationType> {
  /** Prompts, creates, builds, and uploads; the first failing check prints and exits. */
  deploy(options: DeployAppOptions): Promise<DeployResult<T> | undefined>
  /** Runs every check a deploy enforces (including the build) without prompting or mutating anything remote. */
  plan(options: DeployAppOptions): Promise<DeploymentPlan<T>>
  readonly type: T
}

/** What a real deploy produced — the payload `--json` reports. */
export interface DeployResult<T extends DeployedApplicationType = DeployedApplicationType> {
  applicationType: T
  /** Installed framework version the deploy used (`sanity` or `@sanity/sdk-react`). */
  applicationVersion: string
  /** Same shape as the dry-run plan's target; `null` for a config-only singleton deploy. */
  target: DeployTarget | null

  /** Workbench views and services registered with the deploy. */
  exposes?: DeployedExpose[]
  /** Media-library installation config summary, when a singleton config deployed. */
  installationConfig?: string
  /** Set when a media-library singleton deployed its installation config. */
  installationId?: string
}

/** What a `--dry-run` deploy would do: the real deploy sequence with every mutation gated off. */
export interface DeploymentPlan<T extends DeployedApplicationType = DeployedApplicationType> {
  checks: DeployCheck[]
  exposes: DeployedExpose[]
  files: DeploymentFile[]
  installationConfig: string | null
  target: DeployTarget | null
  type: T
  version: string | null
}

export interface DeploymentFile {
  /** Path relative to the project root, POSIX-style. */
  path: string
  size: number
}

export function newPlan<T extends DeployedApplicationType>(
  parts: Partial<DeploymentPlan<T>> &
    Pick<DeploymentPlan<T>, 'checks' | 'target' | 'type' | 'version'>,
): DeploymentPlan<T> {
  return {exposes: [], files: [], installationConfig: null, ...parts}
}

export function isDeployable(plan: DeploymentPlan): boolean {
  return plan.checks.every((check) => check.status !== 'fail')
}

/**
 * Runs a deploy in the mode the flags select: `--dry-run` plans read-only and
 * renders the report, otherwise the adapter deploys for real. `--json` emits
 * the same information as machine-readable JSON on stdout.
 */
export async function runDeploy(options: DeployAppOptions, adapter: DeployAdapter): Promise<void> {
  const {output} = options
  const json = !!options.flags.json
  const emitJson = (payload: unknown) => output.log(JSON.stringify(payload, null, 2))

  // The JSON payload owns stdout, so the run's progress logs go to stderr; only
  // the final JSON.stringify writes to stdout. Spinners are already on stderr.
  const runOptions = json
    ? {
        ...options,
        output: {
          ...output,
          log: (message = '', ...args: unknown[]) =>
            void process.stderr.write(`${format(message, ...args)}\n`),
        },
      }
    : options

  try {
    if (options.flags['dry-run']) {
      const plan = await adapter.plan(runOptions)
      if (json) emitJson(deploymentPlanToJson(plan))
      else renderDeploymentPlan(plan, output)
      exitIfBlocked(plan, output)
      return
    }

    const result = await adapter.deploy(runOptions)
    if (json && result) emitJson({deployed: true, ...result})
  } catch (error) {
    const failure = normalizeFailure(error, adapter.type)
    // A blocked dry run reaches this catch too (its exit throws) and already
    // printed its plan, so only a real deploy adds the {deployed: false} envelope.
    if (json && !options.flags['dry-run']) {
      emitJson({deployed: false, error: {message: failure.message}})
    }
    output.error(failure.message, {exit: failure.exit})
  }
}

/** Exits like a real (fail-fast) deploy would, on the first failing check's exit code. */
function exitIfBlocked(plan: DeploymentPlan, output: Output): void {
  if (isDeployable(plan)) return
  const failed = plan.checks.find((check) => check.status === 'fail')
  output.error('Deploy blocked by failing checks.', {exit: failed?.exitCode ?? 1})
}

/** The one failure diagnosis both the stderr message and the `--json` envelope read. */
function normalizeFailure(
  error: unknown,
  type: DeployedApplicationType,
): {exit: number; message: string} {
  // Ctrl+C on an interactive prompt isn't a real failure
  if (error instanceof Error && error.name === 'ExitPromptError') {
    return {exit: 1, message: 'Deployment cancelled by user'}
  }
  // A failed check already carries its own message and exit code
  if (error instanceof CLIError) {
    return {exit: error.oclif?.exit ?? 1, message: error.message}
  }
  deployDebug(`Error deploying ${deployLabel(type)}`, error)
  return {exit: 1, message: `Error deploying ${deployLabel(type)}: ${getErrorMessage(error)}`}
}

function deployLabel(type: DeployedApplicationType): string {
  return type === 'coreApp' ? 'application' : 'studio'
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

/**
 * A problem-focused, machine-readable projection of the plan: blocking problems
 * mapped to their fix, warnings as messages. Derived from the same checks the
 * human report renders (its pass/skip lines are informational and omitted here).
 */
export function deploymentPlanToJson(plan: DeploymentPlan): {
  applicationType: DeploymentPlan['type']
  applicationVersion: string | null
  errors: Record<string, string | null>
  exposes?: DeployedExpose[]
  files: DeploymentFile[]
  installationConfig?: string
  isDeployable: boolean
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

  // `exposes` and `installationConfig` are workbench-only; plain apps omit them.
  return {
    applicationType: plan.type,
    applicationVersion: plan.version,
    errors,
    ...(plan.exposes.length > 0 ? {exposes: plan.exposes} : {}),
    files: plan.files,
    ...(plan.installationConfig ? {installationConfig: plan.installationConfig} : {}),
    isDeployable: isDeployable(plan),
    target: plan.target,
    totalBytes: totalBytes(plan.files),
    warnings,
  }
}

export function renderDeploymentPlan(plan: DeploymentPlan, output: Output): void {
  const label = deployLabel(plan.type)
  const problems = plan.checks.filter((check) => check.status === 'fail')
  const warnings = plan.checks.filter((check) => check.status === 'warn')

  output.log('\nDry run — no changes made.\n')

  // Only pass/skip here; problems and warnings render below with their fixes.
  for (const check of plan.checks) {
    if (check.status === 'pass' || check.status === 'skip') {
      output.log(`  ${statusIcon(check.status)} ${check.message}`)
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

function renderIssues(output: Output, title: string, checks: DeployCheck[]): void {
  if (checks.length === 0) return

  output.log(`\n${title}`)
  for (const check of checks) {
    const fix = check.solution ? `: ${check.solution}` : ''
    output.log(`  ${statusIcon(check.status)} ${check.message}${fix}`)
  }
}

function totalBytes(files: DeploymentFile[]): number {
  return files.reduce((sum, file) => sum + file.size, 0)
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
