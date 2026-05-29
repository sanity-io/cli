import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {cliConfigSchema} from './schemas.js'
import {type CliConfig} from './types/cliConfig.js'

const STUDIO_CONFIG_FILES = [
  'sanity.config.ts',
  'sanity.config.tsx',
  'sanity.config.js',
  'sanity.config.jsx',
  'sanity.config.mjs',
  'sanity.config.cjs',
]

/**
 * Infer the application type for a workbench app when `unstable_defineApp`
 * didn't set one: a project with a `sanity.config.*` is a studio, otherwise a
 * core (SDK) app. An explicit `applicationType` always wins.
 */
function detectApplicationType(projectDir: string): 'coreApp' | 'studio' {
  return STUDIO_CONFIG_FILES.some((file) => existsSync(join(projectDir, file)))
    ? 'studio'
    : 'coreApp'
}

/**
 * Parse a config whose `app` is a branded `unstable_defineApp(...)` result.
 * The branded `app` bypasses the legacy `app` object schema (which would strip
 * its identity fields and the brand symbol); every other field is still
 * validated. The brand is preserved so downstream code relies on the
 * `isWorkbenchApp` identity (from `@sanity/federation`) instead of a flag.
 *
 * Resolves `applicationType` here — as early as possible — so studio-vs-app
 * classification is settled once and read off the app everywhere else.
 */
export function parseWorkbenchCliConfig(cliConfig: unknown, projectDir: string): CliConfig {
  const {app, ...rest} = cliConfig as Record<string, unknown> & {
    app: Record<string, unknown> & {applicationType?: string}
  }
  const {data, error, success} = cliConfigSchema.safeParse(rest)
  if (!success) {
    throw new Error(`Invalid CLI config: ${error.message}`, {cause: error})
  }
  if (!app.applicationType) {
    app.applicationType = detectApplicationType(projectDir)
  }
  return {...data, app} as CliConfig
}
