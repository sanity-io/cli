import {styleText} from 'node:util'

import {CLIError} from '@oclif/core/errors'
import {type Output, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {confirm, spinner} from '@sanity/cli-core/ux'

import {type UndeployCommand} from '../../commands/undeploy.js'
import {
  type Check,
  type CheckReporter,
  checkStatusIcon,
  createCollectingReporter,
  createFailFastReporter,
  renderIssues,
} from '../../util/checks.js'

const undeployDebug = subdebug('undeploy')

type UndeployFlags = UndeployCommand['flags']

export interface UndeployOptions {
  flags: UndeployFlags
  output: Output
}

/**
 * What an undeploy deletes, resolved once and read by every report — the
 * dry-run plan and the real run's confirmation prompt — so the human and
 * machine outputs can't drift.
 */
export interface UndeployTarget {
  /** Details of the deployment currently being served; `null` when none is live. */
  activeDeployment: {deployedAt: string; deployedBy: string; version: string} | null
  /** Hostname the application is served from. */
  appHost: string | null
  createdAt: string | null
  /** The application an undeploy deletes, along with all its deployments. */
  id: string
  organizationId: string | null
  projectId: string | null
  title: string | null
  type: 'coreApp' | 'studio'
  /** Where the deployed studio/app is currently reachable. */
  url: string | null
}

export type UndeployTargetResolution =
  | {message: string; solution?: string; type: 'none'}
  | {target: UndeployTarget; type: 'found'}

/**
 * The parts of an undeploy that differ per application backend. The shared
 * sequence — mode selection, target reporting, confirmation, error handling —
 * lives in `runUndeploy`; adapters only resolve and delete.
 */
export interface UndeployAdapter {
  /** Resolves what an undeploy would delete; read-only. */
  resolveTarget(): Promise<UndeployTargetResolution>
  type: 'coreApp' | 'studio'
  /** Deletes the target — the only mutating step, never run on a dry run. */
  undeploy(target: UndeployTarget): Promise<void>
}

/** What a `--dry-run` undeploy would do: the real undeploy sequence with the deletion gated off. */
export interface UndeployPlan {
  checks: Check[]
  /** What would be deleted; `null` when there is nothing to undeploy. */
  target: UndeployTarget | null
  type: 'coreApp' | 'studio'
}

/**
 * Runs an undeploy in the mode the flags select: a real undeploy fails fast,
 * confirms, and deletes; `--dry-run` drives the same target resolution
 * read-only and renders a plan instead.
 */
export async function runUndeploy(
  options: UndeployOptions,
  adapter: UndeployAdapter,
): Promise<void> {
  const {flags, output} = options

  try {
    if (flags['dry-run']) {
      const reporter = createCollectingReporter()
      const resolution = await resolveTarget(adapter, reporter)
      const plan: UndeployPlan = {
        checks: reporter.results,
        target: resolution?.type === 'found' ? resolution.target : null,
        type: adapter.type,
      }
      renderUndeployPlan(plan, output)
      // A blocked plan exits like a real (fail-fast) undeploy would.
      const failed = plan.checks.find((check) => check.status === 'fail')
      if (failed) output.error('Undeploy blocked by failing checks.', {exit: failed.exitCode ?? 1})
      return
    }

    await undeployApp(options, adapter)
  } catch (error) {
    const failure = normalizeFailure(error, adapter.type)
    output.error(failure.message, {exit: failure.exit})
  }
}

/** The real run: resolve the target, confirm, delete, report. */
async function undeployApp(options: UndeployOptions, adapter: UndeployAdapter): Promise<void> {
  const {flags, output} = options

  const resolution = await resolveTarget(adapter, createFailFastReporter(output))
  // A resolve failure never lands here: the fail-fast reporter already exited.
  if (!resolution) return
  if (resolution.type === 'none') {
    output.log(`${resolution.message}.`)
    if (resolution.solution) output.log(`${resolution.solution}.`)
    output.log('Nothing to undeploy.')
    return
  }

  const {target} = resolution
  if (!flags.yes) {
    const shouldUndeploy = await confirm({
      default: false,
      message: confirmUndeployMessage(target),
    })
    if (!shouldUndeploy) return
  }

  const spin = spinner(
    `Undeploying ${adapter.type === 'coreApp' ? 'application' : 'studio'}`,
  ).start()
  try {
    await adapter.undeploy(target)
  } catch (error) {
    spin.fail()
    throw error
  }
  spin.succeed()

  printUndeployScheduled(target, output)
}

/**
 * Resolves the undeploy target and reports the verdict as a check, shared by
 * both modes so a real run and a dry run can't diverge.
 */
async function resolveTarget(
  adapter: UndeployAdapter,
  reporter: CheckReporter,
): Promise<UndeployTargetResolution | null> {
  const spin = spinner('Checking application info').start()

  let resolution: UndeployTargetResolution
  try {
    resolution = await adapter.resolveTarget()
  } catch (error) {
    spin.fail()
    undeployDebug('Failed to resolve undeploy target', error)
    reporter.report({
      message: `Failed to resolve undeploy target: ${getErrorMessage(error)}`,
      status: 'fail',
    })
    return null
  }

  spin[resolution.type === 'found' ? 'succeed' : 'fail']()
  reporter.report(describeUndeployTarget(resolution))
  return resolution
}

export function canUndeploy(plan: UndeployPlan): boolean {
  return plan.target !== null && plan.checks.every((check) => check.status !== 'fail')
}

/**
 * The single diagnosis for each undeploy-target verdict, shared by the dry-run
 * report and the real run so message and fix can't drift between the two.
 */
export function describeUndeployTarget(resolution: UndeployTargetResolution): Check {
  if (resolution.type === 'none') {
    return {message: resolution.message, solution: resolution.solution, status: 'skip'}
  }

  const {target} = resolution
  if (target.type === 'studio') {
    return {message: `Undeploys studio ${target.url ?? target.id}`, status: 'pass'}
  }
  const name = target.title ? `"${target.title}" (${target.id})` : target.id
  return {message: `Undeploys application ${name}`, status: 'pass'}
}

export function renderUndeployPlan(plan: UndeployPlan, output: Output): void {
  const label = plan.type === 'coreApp' ? 'application' : 'studio'
  const problems = plan.checks.filter((check) => check.status === 'fail')
  const warnings = plan.checks.filter((check) => check.status === 'warn')

  output.log('\nDry run — no changes made.\n')

  // Only pass/skip here; problems and warnings render below with their fixes.
  for (const check of plan.checks) {
    if (check.status === 'pass' || check.status === 'skip') {
      const fix = check.solution ? `: ${check.solution}` : ''
      output.log(`  ${checkStatusIcon(check.status)} ${check.message}${fix}`)
    }
  }

  if (plan.target) renderTarget(plan.target, output)

  if (canUndeploy(plan)) {
    output.log(styleText('green', `\nThis ${label} can be undeployed.`))
  } else if (problems.length > 0) {
    output.log(styleText('red', `\nThis ${label} can't be undeployed.`))
  } else {
    output.log('\nNothing to undeploy.')
  }

  renderIssues(output, 'Problems to fix:', problems)
  renderIssues(output, 'Warnings:', warnings)
}

function renderTarget(target: UndeployTarget, output: Output): void {
  const rows: [string, string | null][] = [
    ['Title', target.title],
    ['ID', target.id],
    ['URL', target.url],
    ['Deployed', formatDeployment(target.activeDeployment)],
  ]

  output.log('')
  for (const [key, value] of rows) {
    if (value) output.log(`    ${key.padEnd(8)} ${styleText('yellow', value)}`)
  }
}

function formatDeployment(deployment: UndeployTarget['activeDeployment']): string | null {
  if (!deployment) return null
  const parts = [
    deployment.version ? `version ${deployment.version}` : null,
    deployment.deployedAt ? `at ${deployment.deployedAt}` : null,
    deployment.deployedBy ? `by ${deployment.deployedBy}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

function confirmUndeployMessage(target: UndeployTarget): string {
  if (target.type === 'coreApp') {
    return `This will undeploy the following application:

    Title: ${styleText('yellow', target.title || '(untitled application)')}
    ID:    ${styleText('yellow', target.id)}

The application will no longer be available for any of your users if you proceed.

Are you ${styleText('red', 'sure')} you want to undeploy?`
  }

  return `This will undeploy ${styleText('yellow', target.url ?? target.id)} and make it unavailable for your users.
Are you ${styleText('red', 'sure')} you want to undeploy?`
}

function printUndeployScheduled(target: UndeployTarget, output: Output): void {
  if (target.type === 'coreApp') {
    output.log(
      `\n${styleText('bold', '⏱️ Application undeploy scheduled.')} It might be a few minutes until ${
        target.title ? styleText('italic', `'${target.title}'`) : 'your application'
      } is unavailable.`,
    )
    output.log(
      `\n${styleText('bold', 'Remember to remove `deployment.appId` from your application configuration')} to avoid errors when redeploying.`,
    )
    return
  }

  output.log(
    `\nStudio undeploy scheduled. It might be a few minutes until ${target.url ?? 'your studio'} is unavailable.`,
  )
}

/** The one failure diagnosis the stderr message reads. */
function normalizeFailure(
  error: unknown,
  type: UndeployAdapter['type'],
): {exit: number; message: string} {
  // Ctrl+C on the confirmation prompt isn't a real failure
  if (error instanceof Error && error.name === 'ExitPromptError') {
    return {exit: 1, message: 'Undeploy cancelled by user'}
  }
  // A failed check already carries its own message and exit code
  if (error instanceof CLIError) {
    return {exit: error.oclif?.exit ?? 1, message: error.message}
  }
  const label = type === 'coreApp' ? 'application' : 'studio'
  undeployDebug(`Error undeploying ${label}`, error)
  return {exit: 1, message: `Error undeploying ${label}: ${getErrorMessage(error)}`}
}
