/**
 * What an undeploy deletes, resolved once and read by every report — the
 * dry-run plan, the `--json` payloads, and the real run's confirmation prompt —
 * so the human and machine outputs can't drift.
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
  title: string | null
  type: 'coreApp' | 'studio'
  url: string | null

  application?: object
  payload?: UndeployPayload
  /** Human-report lines only; never serialized. */
  summary?: string[]
}

/** Collected locally, so a dry run reports it too. */
export interface UndeployPayload {
  /** The configured `deployment.appId`; `null` when none is set. */
  appId: string | null
  type: 'coreApp' | 'studio'

  /** Media-library config summary. */
  config?: string
  services?: object[]
  views?: object[]
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
