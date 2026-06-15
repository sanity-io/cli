import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {cliConfigSchema} from './schemas.js'
import {type CliConfig} from './types/cliConfig.js'

/**
 * The brand `unstable_defineApp` stamps on its result, registered in the global
 * symbol registry. `unstable_defineApp` lives in `@sanity/cli-build`, which
 * depends on cli-core — so cli-core can't import the brand without a cycle, and
 * wouldn't pull the build package into startup just for this identity check
 * anyway (cli-core is the hot path for every CLI command, most of which never
 * touch workbench). `Symbol.for` keys the same global symbol `unstable_defineApp`
 * stamps, so the check is identical; the only shared contract is the symbol
 * string, which cli-core mirrors (see `APPLICATION_TYPES` below).
 */
const WORKBENCH_APP_BRAND = Symbol.for('sanity.workbench.defineApp')

/**
 * Whether `app` is a branded `unstable_defineApp(...)` result — the sole
 * workbench opt-in. Narrows to the shared `app` config plus the workbench-only
 * fields a branded result carries: its `name`, dock panel `views`, and
 * background worker `services`. The `type` literals match the `DefineAppInput`
 * schema so `views`/`services` stay assignable to
 * `DefineAppInput['views' | 'services']` downstream.
 */
export function isWorkbenchApp(app: CliConfig['app']): app is NonNullable<CliConfig['app']> & {
  name: string
  services?: {name: string; src: string; type: 'worker'}[]
  views?: {name: string; src: string; type: 'panel'}[]
} {
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

// Mirrors the `ApplicationType` enum in `@sanity/cli-build`'s `defineApp` schema.
// `unstable_defineApp` is a pure identity wrapper that doesn't validate its
// input, so the loader is the first place an explicit `applicationType` can be checked.
const APPLICATION_TYPES = ['coreApp', 'studio', 'canvas', 'dashboard', 'media-library'] as const
type ApplicationType = (typeof APPLICATION_TYPES)[number]

function isApplicationType(value: unknown): value is ApplicationType {
  return typeof value === 'string' && (APPLICATION_TYPES as readonly string[]).includes(value)
}

/**
 * Infer the application type for a workbench app when `unstable_defineApp`
 * didn't set one: a project with a `sanity.config.*` is a studio, otherwise a
 * core (SDK) app. An explicit `applicationType` always wins.
 */
function detectApplicationType(projectDir: string): ApplicationType {
  return STUDIO_CONFIG_FILES.some((file) => existsSync(join(projectDir, file)))
    ? 'studio'
    : 'coreApp'
}

/**
 * Parse a config whose `app` is a branded `unstable_defineApp(...)` result.
 * The branded `app` bypasses the legacy `app` object schema (which would strip
 * its identity fields and the brand symbol); every other field is still
 * validated. The brand is preserved so downstream code relies on the
 * `isWorkbenchApp` identity (above) instead of a flag.
 *
 * Resolves `applicationType` here — as early as possible — so studio-vs-app
 * classification is settled once and read off the app everywhere else. The
 * resolved value lands on a clone, never the caller's object, so re-parsing the
 * same `app` for a different directory can't inherit a stale inference.
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

  // Clone the branded app rather than mutating the caller's object. Copying own
  // property descriptors carries over the non-enumerable `unstable_defineApp`
  // brand, which a spread would drop.
  const resolvedApp = Object.defineProperties({}, Object.getOwnPropertyDescriptors(app)) as Record<
    string,
    unknown
  >
  resolvedApp.applicationType = applicationType

  return {...data, app: resolvedApp} as CliConfig
}
