/**
 * What an undeploy deletes, resolved once and read by every report — the
 * dry-run plan, the `--json` payloads, and the real run's confirmation prompt —
 * so the human and machine outputs can't drift. Adapters may extend the
 * variants with backend-specific fields; they serialize into `--json` as-is,
 * except the report-only `summary`.
 */
export type UndeployTarget = UndeployApplicationTarget | UndeployConfigTarget

/** An undeploy that deletes the application, along with all its deployments. */
export interface UndeployApplicationTarget extends UndeployTargetDetails {
  deletes: 'application'
  id: string
}

/** An undeploy that deletes an installation's deployed config; the installation stays installed. */
export interface UndeployConfigTarget extends UndeployTargetDetails {
  deletes: 'config'
  id: null
}

interface UndeployTargetDetails {
  /** Details of the deployment currently being served; `null` when none is live. */
  activeDeployment: {deployedAt: string; deployedBy: string} | null
  /** Hostname the application is served from; freed for anyone to claim after undeploy. */
  appHost: string | null
  createdAt: string | null
  organizationId: string | null
  projectId: string | null
  title: string | null
  type: 'coreApp' | 'studio'
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
