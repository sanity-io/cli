// Package-internal shared resolver: turn a CLI config's branded
// `unstable_defineMediaLibrary` config into its target `appType`, owning
// `organizationId`, and `fields`, or `null` when the config is not a config
// (a plain project or an app). The deploy/undeploy/build paths consult this
// second resolver; app-only callers keep using `resolveWorkbenchApp`.

import {type CliConfig} from '@sanity/cli-core'
import {z} from 'zod/mini'

import {ConfigSchema} from './contract.js'
import {isWorkbenchConfig, type WorkbenchConfig} from './defineApp.js'

/**
 * Resolve the workbench config for a CLI config, or `null` when it carries no
 * config brand (a plain project or an app).
 * @public
 */
export function resolveWorkbenchConfig(
  cliConfig: CliConfig | null | undefined,
): WorkbenchConfig | null {
  const app = cliConfig?.app
  if (!isWorkbenchConfig(app)) return null

  const result = z
    .intersection(
      ConfigSchema,
      z.object({
        organizationId: z.string(
          "Config `organizationId` is required — pass the owning organization's ID",
        ),
      }),
    )
    .safeParse(app)
  if (!result.success) {
    throw new Error(`Invalid ${app.appType} config:\n${z.prettifyError(result.error)}`)
  }

  return app
}
