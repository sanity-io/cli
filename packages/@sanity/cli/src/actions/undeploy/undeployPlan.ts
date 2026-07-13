import {styleText} from 'node:util'

import {type Output} from '@sanity/cli-core'

import {type Check, checkStatusIcon, renderIssues} from '../../util/checks.js'

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
      const label = plan.type === 'coreApp' ? 'Application' : 'Studio'
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
