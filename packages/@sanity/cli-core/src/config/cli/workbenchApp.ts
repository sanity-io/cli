import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {z} from 'zod/mini'

import {cliConfigSchema} from './schemas.js'
import {type CliConfig} from './types/cliConfig.js'

// Re-derived via `Symbol.for`, not imported from `@sanity/workbench-cli`: that
// import would cycle (it depends on cli-core) and pull workbench code into the
// hot config-load path.
const WORKBENCH_APP_BRAND = Symbol.for('sanity.workbench.defineApp')
const WORKBENCH_CONFIG_BRAND = Symbol.for('sanity.workbench.defineConfig')

/**
 * Boolean brand check — used for config-load routing, kept exported for
 * backward compatibility. For the typed narrowing (the app's declared fields),
 * use `isWorkbenchApp` from `@sanity/workbench-cli`, derived from the schema.
 */
export function isWorkbenchApp(app: unknown): boolean {
  return typeof app === 'object' && app !== null && WORKBENCH_APP_BRAND in app
}

/**
 * Boolean brand check for a branded `unstable_defineMediaLibrary(...)` config.
 * A config is not an app — it lives in `cliConfig.app` but skips the legacy `app`
 * schema and `applicationType` stamping, and resolves via `resolveWorkbenchConfig`.
 */
export function isWorkbenchConfig(app: unknown): boolean {
  return typeof app === 'object' && app !== null && WORKBENCH_CONFIG_BRAND in app
}

const STUDIO_CONFIG_FILES = [
  'sanity.config.ts',
  'sanity.config.tsx',
  'sanity.config.js',
  'sanity.config.jsx',
  'sanity.config.mjs',
  'sanity.config.cjs',
]

// Mirrors the `ApplicationType` enum in `@sanity/workbench-cli`'s `defineApp`
// schema — `defineApplication` doesn't validate, so the loader is the first
// place `applicationType` can be checked. Kept in sync by a test there.
const APPLICATION_TYPES = ['coreApp', 'studio', 'canvas', 'dashboard'] as const
const applicationTypeSchema = z.enum(APPLICATION_TYPES)

/** The resolved kind of a workbench app — `studio` or one of the SDK app types. */
export type ApplicationType = z.infer<typeof applicationTypeSchema>

/** Infer the type when unset: `sanity.config.*` present → studio, else core (SDK) app. */
function detectApplicationType(projectDir: string): ApplicationType {
  return STUDIO_CONFIG_FILES.some((file) => existsSync(join(projectDir, file)))
    ? 'studio'
    : 'coreApp'
}

/**
 * Parse a config whose `app` is a branded `defineApplication(...)` result. The
 * branded `app` bypasses the legacy `app` schema (which would strip its identity
 * fields and the brand); every other field is still validated.
 *
 * Resolves `applicationType` once, here, so studio-vs-app is settled everywhere
 * downstream. The value lands on a clone, never the caller's object, so
 * re-parsing the same `app` for another directory can't inherit a stale guess.
 */
export function parseWorkbenchCliConfig(cliConfig: unknown, projectDir: string): CliConfig {
  const {app, ...rest} = cliConfig as Record<string, unknown> & {
    app: Record<string, unknown> & {applicationType?: string}
  }
  const {data, error, success} = cliConfigSchema.safeParse(rest)
  if (!success) {
    throw new Error(`Invalid CLI config: ${error.message}`, {cause: error})
  }

  // Clone via property descriptors, not spread — carries over the non-enumerable
  // brand and avoids mutating the caller's object.
  const resolvedApp = Object.defineProperties({}, Object.getOwnPropertyDescriptors(app)) as Record<
    string,
    unknown
  >

  // A config is not an app: it carries no `applicationType` (it targets one by
  // `appType`), so skip detection/stamping and pass its branded shape through.
  if (isWorkbenchConfig(app)) {
    return {...data, app: resolvedApp} as CliConfig
  }

  const explicit = app.applicationType
  if (explicit !== undefined && !applicationTypeSchema.safeParse(explicit).success) {
    throw new Error(
      `Invalid \`applicationType\` "${explicit}" in \`defineApplication\` — expected one of: ${APPLICATION_TYPES.join(', ')}`,
    )
  }
  resolvedApp.applicationType = explicit ?? detectApplicationType(projectDir)

  return {...data, app: resolvedApp} as CliConfig
}
