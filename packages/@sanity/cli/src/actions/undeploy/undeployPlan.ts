import {styleText} from 'node:util'

import {type Output} from '@sanity/cli-core'
import {type UndeployTarget, type UndeployTargetResolution} from '@sanity/cli-core/undeploy'

import {type Check, checkStatusIcon, renderIssues} from '../../util/checks.js'

/** What a `--dry-run` undeploy would do: the real undeploy sequence with the deletion gated off. */
export interface UndeployPlan {
  checks: Check[]
  /** Why there is nothing to undeploy; `null` when a target resolved. */
  reason: string | null
  /** What would be deleted; `null` when there is nothing to undeploy. */
  target: UndeployTarget | null
  type: 'coreApp' | 'studio'
}

export function canUndeploy(plan: UndeployPlan): boolean {
  return plan.target !== null && plan.checks.every((check) => check.status !== 'fail')
}

/**
 * The target as `--json` reports it: the adapter's structured fields as-is,
 * minus the report-only `summary` lines.
 */
export function toJsonTarget<TTarget extends UndeployTarget>(
  target: TTarget,
): Omit<TTarget, 'summary'> {
  const {summary, ...rest} = target
  return rest
}

/**
 * A machine-readable projection of the plan: blocking problems mapped to their
 * fix, warnings as messages. Derived from the same checks and target the human
 * report renders, so the two can't drift.
 */
export function undeployPlanToJson(plan: UndeployPlan): {
  application: Omit<UndeployTarget, 'summary'> | null
  canUndeploy: boolean
  errors: Record<string, string | null>
  reason: string | null
  warnings: string[]
} {
  const errors: Record<string, string | null> = {}
  const warnings: string[] = []
  for (const check of plan.checks) {
    if (check.status === 'fail') errors[check.message] = check.solution ?? null
    else if (check.status === 'warn') warnings.push(check.message)
  }

  return {
    application: plan.target ? toJsonTarget(plan.target) : null,
    canUndeploy: canUndeploy(plan),
    errors,
    reason: plan.reason,
    warnings,
  }
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
  if (target.deletes === 'config') {
    return {
      message: target.title
        ? `Undeploys the installation config for "${target.title}"`
        : 'Undeploys the installation config',
      status: 'pass',
    }
  }
  if (target.type === 'studio') {
    return {message: `Undeploys studio ${target.url ?? target.id}`, status: 'pass'}
  }
  const name = target.title ? `"${target.title}" (${target.id})` : target.id
  return {message: `Undeploys application ${name}`, status: 'pass'}
}

export function renderUndeployPlan(plan: UndeployPlan, output: Output): void {
  const problems = plan.checks.filter((check) => check.status === 'fail')
  const warnings = plan.checks.filter((check) => check.status === 'warn')

  output.log('\nDry run — no changes made.\n')

  // Only pass/skip here; problems and warnings render below with their fixes.
  // A passing target check already says what gets undeployed, so an
  // undeployable plan needs no extra verdict line.
  for (const check of plan.checks) {
    if (check.status === 'pass' || check.status === 'skip') {
      const fix = check.solution ? `: ${check.solution}` : ''
      output.log(`  ${checkStatusIcon(check.status)} ${check.message}${fix}`)
    }
  }

  if (plan.target) renderTarget(plan.target, output)

  if (!canUndeploy(plan)) {
    if (problems.length > 0) {
      const label =
        plan.target?.deletes === 'config'
          ? `Installation config${plan.target.title ? ` for "${plan.target.title}"` : ''}`
          : plan.type === 'coreApp'
            ? 'Application'
            : 'Studio'
      output.log(styleText('red', `\n${checkStatusIcon('fail')} ${label} can not be undeployed.`))
    } else {
      output.log('\nNothing to undeploy.')
    }
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

  // Adapter-authored lines about what gets deleted (interfaces, config snapshots, …)
  for (const entry of target.summary ?? []) {
    for (const line of entry.split('\n')) output.log(`    ${line}`)
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
