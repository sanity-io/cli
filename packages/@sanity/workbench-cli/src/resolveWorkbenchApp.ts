// Package-internal shared resolver: turn a CLI config's branded
// `defineApplication` app into its declared interfaces, or `null` for a plain
// project — and for a config (a branded `unstable_defineMediaLibrary`), which
// is not an app. The build and deploy accessors (actions/build, actions/deploy)
// each build their command-specific view on top of this one brand-check +
// extraction, so the discrimination lives in exactly one place.

import {type AppVisibility, type CliConfig} from '@sanity/cli-core'

import {type WorkbenchConfigValue} from './contract.js'
import {type DefineAppInput, isWorkbenchApp} from './defineApp.js'
import {formatWorkbenchAppErrors, validateWorkbenchApp} from './validateWorkbenchApp.js'

/**
 * Bundled so adding a declaration family touches this type and the artifact
 * expanders, not every hop of build/dev plumbing in between. `config` is sourced
 * from `resolveWorkbenchConfig` (a config is not an app), not from this resolver.
 * @internal
 */
export interface WorkbenchExposes {
  config?: WorkbenchConfigValue
  views?: DefineAppInput['views']
  webWorkers?: DefineAppInput['webWorkers']
}

/** @public */
export interface ResolvedWorkbenchApp {
  /**
   * Stable identity, distinct from the `slug` address. Defaults to `slug`, and is
   * what every identity key (build id, interface ids) is built from.
   */
  readonly name: string
  /** Organization that owns the app — part of its build-id identity. */
  readonly organizationId: string
  readonly slug: string

  /** Views the app declares. */
  readonly views: NonNullable<DefineAppInput['views']>

  /** Background web workers the app declares. */
  readonly webWorkers: NonNullable<DefineAppInput['webWorkers']>

  /** Resolved app kind — `studio` or one of the SDK app types. */
  readonly applicationType?: string
  /** SDK app-view entrypoint, when declared. */
  readonly entry?: string
  /** Path to the app's icon SVG, resolved and shipped to Brett on deploy. */
  readonly icon?: string
  /** Dashboard visibility declared by the app; `undefined` when unset. */
  readonly visibility?: AppVisibility
}

/**
 * Resolve the workbench app for a CLI config, or `null` for a plain project or a
 * config (which is not an app — read it with `resolveWorkbenchConfig`).
 * @public
 */
export function resolveWorkbenchApp(
  cliConfig: CliConfig | null | undefined,
): ResolvedWorkbenchApp | null {
  const app = cliConfig?.app
  // A config carries a distinct brand, so `isWorkbenchApp` is false for it — it
  // resolves to `null` here, like a plain project.
  if (!isWorkbenchApp(app)) return null

  const errors = validateWorkbenchApp(app)
  if (errors.length > 0) throw new Error(formatWorkbenchAppErrors(errors))

  return {
    applicationType: app.applicationType,
    entry: app.entry,
    icon: app.icon,
    // Identity defaults to the address, so existing apps behave identically.
    name: app.name ?? app.slug,
    organizationId: app.organizationId,
    slug: app.slug,
    views: app.views ?? [],
    visibility: app.visibility,
    webWorkers: app.webWorkers ?? [],
  }
}
