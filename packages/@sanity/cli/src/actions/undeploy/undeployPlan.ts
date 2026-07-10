import {styleText} from 'node:util'

import {type Output} from '@sanity/cli-core'
import {type Check, checkStatusIcon, renderIssues} from '@sanity/cli-core/checks'

import {type UndeployTarget, type UndeployTargetResolution} from './types.js'

/** What a `--dry-run` undeploy would do: the real undeploy sequence with the deletion gated off. */
export interface UndeployPlan {
  checks: Check[]
  /** What would be deleted; `null` when there is nothing to undeploy. */
  target: UndeployTarget | null
  type: 'coreApp' | 'studio'
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
  if (target.applicationType === 'studio') {
    return {message: `Undeploys studio ${target.url ?? target.applicationId}`, status: 'pass'}
  }
  const name = target.title ? `"${target.title}" (${target.applicationId})` : target.applicationId
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
    output.log(
      plan.type === 'coreApp'
        ? 'The application will no longer be available for any of your users.'
        : 'The hostname will become available for anyone to claim.',
    )
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
    ['ID', target.applicationId],
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
