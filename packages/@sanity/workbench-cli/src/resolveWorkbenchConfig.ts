// Package-internal shared resolver: turn a CLI config's branded
// `unstable_defineMediaLibrary` config into its target `appType`, owning
// `organizationId`, and `fields`, or `null` when the config is not a config
// (a plain project or an app). The deploy/undeploy/build paths consult this
// second resolver; app-only callers keep using `resolveWorkbenchApp`.

import {type CliConfig} from '@sanity/cli-core'

import {ConfigSchema, type WorkbenchConfigValue} from './contract.js'
import {isWorkbenchConfig} from './defineApp.js'

/** @public */
export interface ResolvedMediaLibraryConfig {
  /** Target app the config binds to — resolves the org installation on deploy. */
  readonly appType: WorkbenchConfigValue['appType']
  /** The config's declared fields, expanded into the federation remote on build. */
  readonly fields: WorkbenchConfigValue['fields']
  /** Organization that owns the config's target installation. */
  readonly organizationId: string
}

/**
 * Resolve the workbench config for a CLI config, or `null` when it carries no
 * config brand (a plain project or an app). The only config today is the Media
 * Library, so the resolved shape is a {@link ResolvedMediaLibraryConfig}.
 * @public
 */
export function resolveWorkbenchConfig(
  cliConfig: CliConfig | null | undefined,
): ResolvedMediaLibraryConfig | null {
  const app = cliConfig?.app
  if (!isWorkbenchConfig(app)) return null

  const result = ConfigSchema.safeParse({appType: app.appType, fields: app.fields})
  if (!result.success) {
    throw new Error(`Invalid workbench config: ${result.error.message}`)
  }

  return {appType: app.appType, fields: app.fields, organizationId: app.organizationId}
}
