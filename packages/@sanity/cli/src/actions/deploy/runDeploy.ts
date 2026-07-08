// The command-facing entry: picks the flow from the flags (`--dry-run` plans
// read-only, otherwise the adapter deploys for real) and owns all `--json`
// concerns. The flows themselves live in @sanity/cli-core/deploy.

import {format, styleText} from 'node:util'

import {CLIError} from '@oclif/core/errors'
import {getErrorMessage, type Output} from '@sanity/cli-core'
import {
  type DeployAdapter,
  type DeployAppOptions,
  type DeployCheck,
  type DeployedApplicationType,
  type DeploymentPlan,
  executeDeploy,
  isDeployable,
  planDeploy,
} from '@sanity/cli-core/deploy'
import {logSymbols} from '@sanity/cli-core/ux'

import {pluralize} from '../../util/pluralize.js'
import {deployDebug} from './deployDebug.js'

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
      const plan = await planDeploy(adapter, runOptions)
      if (json) emitJson(deploymentPlanToJson(plan))
      else renderDeploymentPlan(plan, output)
      exitIfBlocked(plan, output)
      return
    }

    const result = await executeDeploy(adapter, runOptions)
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
 * A problem-focused, machine-readable projection of the plan: blocking problems
 * mapped to their fix, warnings as messages. Derived from the same checks the
 * human report renders (its pass/skip lines are informational and omitted here).
 */
export function deploymentPlanToJson(plan: DeploymentPlan): {
  applicationType: DeploymentPlan['type']
  applicationVersion: string | null
  errors: Record<string, string | null>
  exposes?: DeploymentPlan['exposes']
  files: DeploymentPlan['files']
  installationConfig?: string
  isDeployable: boolean
  target: DeploymentPlan['target']
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
    totalBytes: totalBytes(plan),
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
      `\nFiles to deploy (${plan.files.length} ${pluralize('file', plan.files.length)}, ${formatMB(totalBytes(plan))}):`,
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

function totalBytes(plan: DeploymentPlan): number {
  return plan.files.reduce((sum, file) => sum + file.size, 0)
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
