// Package-internal shared resolver: turn a CLI config's branded
// `unstable_defineApp` app into its declared interfaces, or `null` for a plain
// project. The build and deploy accessors (actions/build, actions/deploy) each
// build their command-specific view on top of this one brand-check +
// extraction, so the discrimination lives in exactly one place.

import {type CliConfig} from '@sanity/cli-core'

import {type DefineAppInput, isWorkbenchApp} from './defineApp.js'

/**
 * Bundled so adding a declaration family touches this type and the artifact
 * expanders, not every hop of build/dev plumbing in between.
 * @internal
 */
export interface WorkbenchExposes {
  installationConfig?: DefineAppInput['installationConfig']
  services?: DefineAppInput['services']
  views?: DefineAppInput['views']
}

/** @public */
export interface ResolvedWorkbenchApp {
  /** The app's unique `name` from `unstable_defineApp`. */
  readonly name: string
  /** Background worker services the app declares. */
  readonly services: NonNullable<DefineAppInput['services']>
  /** Dock panel views the app declares. */
  readonly views: NonNullable<DefineAppInput['views']>

  /** Resolved app kind — `studio` or one of the SDK app types. */
  readonly applicationType?: string
  /** SDK app-view entrypoint, when declared. */
  readonly entry?: string
  /** Deploys on its own path, separate from the interfaces. */
  readonly installationConfig?: DefineAppInput['installationConfig']
}

/**
 * Resolve the workbench app for a CLI config, or `null` for a plain project.
 * @public
 */
export function resolveWorkbenchApp(
  cliConfig: CliConfig | null | undefined,
): ResolvedWorkbenchApp | null {
  const app = cliConfig?.app
  if (!isWorkbenchApp(app)) return null

  return {
    applicationType: app.applicationType,
    entry: app.entry,
    installationConfig: app.installationConfig,
    name: app.name,
    services: app.services ?? [],
    views: app.views ?? [],
  }
}
