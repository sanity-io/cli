import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {cliConfigSchema} from './schemas.js'
import {type CliConfig} from './types/cliConfig.js'

// Re-derived via `Symbol.for`, not imported from `@sanity/workbench-cli`: that
// import would cycle (it depends on cli-core) and pull workbench code into the
// hot config-load path.
const WORKBENCH_APP_BRAND = Symbol.for('sanity.workbench.defineApp')

/**
 * Boolean brand check — used for config-load routing, kept exported for
 * backward compatibility. For the typed narrowing (the app's declared fields),
 * use `isWorkbenchApp` from `@sanity/workbench-cli`, derived from the schema.
 */
export function isWorkbenchApp(app: CliConfig['app']): boolean {
  return typeof app === 'object' && app !== null && WORKBENCH_APP_BRAND in app
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
// schema — `unstable_defineApp` doesn't validate, so the loader is the first
// place `applicationType` can be checked. Kept in sync by a test there.
const APPLICATION_TYPES = ['coreApp', 'studio', 'dashboard', 'media-library'] as const

/** The resolved kind of a workbench app — `studio` or one of the SDK app types. */
export type ApplicationType = (typeof APPLICATION_TYPES)[number]

function isApplicationType(value: unknown): value is ApplicationType {
  return typeof value === 'string' && (APPLICATION_TYPES as readonly string[]).includes(value)
}

/** Infer the type when unset: `sanity.config.*` present → studio, else core (SDK) app. */
function detectApplicationType(projectDir: string): ApplicationType {
  return STUDIO_CONFIG_FILES.some((file) => existsSync(join(projectDir, file)))
    ? 'studio'
    : 'coreApp'
}

/**
 * Parse a config whose `app` is a branded `unstable_defineApp(...)` result. The
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

  const explicit = app.applicationType
  if (explicit !== undefined && !isApplicationType(explicit)) {
    throw new Error(
      `Invalid \`applicationType\` "${explicit}" in \`unstable_defineApp\` — expected one of: ${APPLICATION_TYPES.join(', ')}`,
    )
  }
  const applicationType = explicit ?? detectApplicationType(projectDir)

  // Clone via property descriptors, not spread — carries over the non-enumerable
  // brand and avoids mutating the caller's object.
  const resolvedApp = Object.defineProperties({}, Object.getOwnPropertyDescriptors(app)) as Record<
    string,
    unknown
  >
  resolvedApp.applicationType = applicationType

  return {...data, app: resolvedApp} as CliConfig
}
