// Package-internal shared resolver: turn a CLI config's branded
// `unstable_defineApp` app into its declared interfaces, or `null` for a plain
// project. The build and deploy accessors (actions/build, actions/deploy) each
// build their command-specific view on top of this one brand-check +
// extraction, so the discrimination lives in exactly one place.

import {type AppVisibility, type CliConfig} from '@sanity/cli-core'

import {type DefineAppInput, isWorkbenchApp, readConfig, type WorkbenchApp} from './defineApp.js'
import {validateWorkbenchApp} from './validateWorkbenchApp.js'

/**
 * Bundled so adding a declaration family touches this type and the artifact
 * expanders, not every hop of build/dev plumbing in between.
 * @internal
 */
export interface WorkbenchExposes {
  config?: WorkbenchApp['config']
  services?: DefineAppInput['services']
  views?: DefineAppInput['views']
}

/** @public */
export interface ResolvedWorkbenchApp {
  /** The app's unique `name` from `unstable_defineApp`. */
  readonly name: string
  /** Organization that owns the app — part of its build-id identity. */
  readonly organizationId: string
  /** Background worker services the app declares. */
  readonly services: NonNullable<DefineAppInput['services']>

  /** Hostname the application is created at on first deploy. */
  readonly slug: string

  /** Dock panel views the app declares. */
  readonly views: NonNullable<DefineAppInput['views']>

  /** Resolved app kind — `studio` or one of the SDK app types. */
  readonly applicationType?: string
  /** Deploys on its own path, separate from the interfaces. */
  readonly config?: WorkbenchApp['config']
  /** SDK app-view entrypoint, when declared. */
  readonly entry?: string
  /** Path to the app's icon SVG, resolved and shipped to Brett on deploy. */
  readonly icon?: string
  /** Explicit singleton flag (a Sanity-owned app); `undefined` when the app doesn't set it. */
  readonly isSingleton?: boolean
  /** Dashboard visibility declared by the app; `undefined` when unset. */
  readonly visibility?: AppVisibility
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

  validateWorkbenchApp(app)

  return {
    applicationType: app.applicationType,
    config: readConfig(app),
    entry: app.entry,
    icon: app.icon,
    isSingleton: app.isSingleton,
    name: app.name,
    organizationId: app.organizationId,
    services: app.services ?? [],
    slug: app.slug,
    views: app.views ?? [],
    visibility: app.visibility,
  }
}
