/**
 * What an undeploy deletes, resolved once and read by every report — the
 * dry-run plan, the `--json` payloads, and the real run's confirmation prompt —
 * so the human and machine outputs can't drift. Adapters may extend it with
 * backend-specific fields; they serialize into `--json` as-is.
 */
export interface UndeployTarget {
  /** Details of the deployment currently being served; `null` when none is live. */
  activeDeployment: {deployedAt: string; deployedBy: string; version: string} | null
  /** Hostname the application is served from; freed for anyone to claim after undeploy. */
  appHost: string | null
  /** The application an undeploy deletes, along with all its deployments; `null` for a config-only undeploy. */
  id: string | null
  type: 'coreApp' | 'studio'
  createdAt: string | null
  /** What gets deleted: the application (with its deployments and interfaces) or an installation's config. */
  deletes: 'application' | 'config'
  organizationId: string | null
  projectId: string | null
  title: string | null
  /** Where the deployed studio/app is currently reachable. */
  url: string | null

  /**
   * Adapter-authored report lines about what gets deleted (interfaces, config
   * snapshots, …), rendered under the target details. Built from the same data
   * the adapter puts on its target, so the report can't drift from the payload.
   */
  summary?: string[]
}

export type UndeployTargetResolution<TTarget extends UndeployTarget = UndeployTarget> =
  | {message: string; solution?: string; type: 'none'}
  | {target: TTarget; type: 'found'}

/**
 * The parts of an undeploy that differ per application backend. The shared
 * sequence — mode selection, target reporting, confirmation, error handling —
 * lives in the host CLI's runner; adapters only resolve and delete.
 */
export interface UndeployAdapter<TTarget extends UndeployTarget = UndeployTarget> {
  /** Resolves what an undeploy would delete; read-only. */
  resolveTarget(): Promise<UndeployTargetResolution<TTarget>>
  type: 'coreApp' | 'studio'
  /** Deletes the target — the only mutating step, never run on a dry run. */
  undeploy(target: TTarget): Promise<void>
}
