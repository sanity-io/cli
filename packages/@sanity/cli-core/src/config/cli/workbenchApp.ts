import {cliConfigSchema} from './schemas.js'
import {type CliConfig} from './types/cliConfig.js'

/**
 * Brand `@sanity/federation`'s `unstable_defineApp` stamps onto its result.
 * Registered via the global symbol registry so it survives module-realm
 * boundaries between the helper and the CLI. Keep the key in sync with
 * `@sanity/federation`.
 */
const WORKBENCH_APP_BRAND = Symbol.for('sanity.workbench.defineApp')

/**
 * Whether a config's `app` is a branded `unstable_defineApp(...)` result.
 * Calling `unstable_defineApp` is the opt-in for workbench behavior — configs
 * without the brand take the existing codepath untouched.
 */
export function isWorkbenchApp(app: unknown): boolean {
  return typeof app === 'object' && app !== null && WORKBENCH_APP_BRAND in app
}

/**
 * Parse a config whose `app` is a branded `unstable_defineApp(...)` result.
 * The branded `app` is owned by the helper, so it bypasses the legacy `app`
 * object schema (which would strip its identity fields). Every other field is
 * still validated by the standard schema.
 */
export function parseWorkbenchCliConfig(cliConfig: unknown): CliConfig {
  const {app, ...rest} = cliConfig as Record<string, unknown> & {app: unknown}
  const {data, error, success} = cliConfigSchema.safeParse(rest)
  if (!success) {
    throw new Error(`Invalid CLI config: ${error.message}`, {cause: error})
  }
  return {...data, app} as CliConfig
}
