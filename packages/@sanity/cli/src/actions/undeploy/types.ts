import {type Output} from '@sanity/cli-core'

import {type UndeployCommand} from '../../commands/undeploy.js'

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
  /** Hostname the application is served from; freed for anyone to claim after undeploy. */
  appHost: string | null
  /** The application an undeploy deletes, along with all its deployments. */
  applicationId: string
  applicationType: 'coreApp' | 'studio'
  createdAt: string | null
  organizationId: string | null
  projectId: string | null
  title: string | null
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
