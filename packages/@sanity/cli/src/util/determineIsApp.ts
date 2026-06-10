import {type CliConfig, isWorkbenchApp} from '@sanity/cli-core'

/**
 * Determine if the current project is an app (as opposed to a studio).
 *
 * For workbench apps (`unstable_defineApp`), this is driven by the resolved
 * `applicationType` — a studio is not an app, everything else is. The
 * `applicationType` is settled at config-load time (explicit, or inferred from
 * the presence of a `sanity.config.*`). Legacy configs fall back to the
 * presence of an `app` field.
 *
 * @returns `true` if the current project is an app, `false` otherwise.
 */
export function determineIsApp(cliConfig: CliConfig): boolean {
  const app = cliConfig?.app
  if (isWorkbenchApp(app)) {
    return (app as {applicationType?: string}).applicationType !== 'studio'
  }
  return Boolean(cliConfig && 'app' in cliConfig)
}
