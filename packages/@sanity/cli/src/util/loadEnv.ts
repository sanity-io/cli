import {readFileSync, statSync} from 'node:fs'
import {join} from 'node:path'

import {parse} from 'dotenv'
import {expand} from 'dotenv-expand'

/**
 * Load environment variables from `.env` files in the Vite convention,
 * without importing Vite itself: the CLI's prerun hook runs this for every
 * command, and Vite (with its native binaries) is not part of the base
 * install of the bundled CLI distribution.
 *
 * Mirrors `loadEnv` from Vite: reads `.env`, `.env.local`, `.env.[mode]` and
 * `.env.[mode].local` from `envDir` (most specific file wins), expands
 * variable references without mutating `process.env`, and returns the
 * variables matching `prefixes` — plus any already-set `process.env` variables
 * matching `prefixes`, which take precedence over file values.
 *
 * @param mode - The mode to load env files for (eg `development`, `production`)
 * @param envDir - Directory to look for env files in
 * @param prefixes - Env variable prefix(es) to include. Defaults to `VITE_`; pass `''` to include everything
 * @returns The loaded environment variables
 *
 * @internal
 */
export function loadEnv(
  mode: string,
  envDir: string,
  prefixes: string | string[] = 'VITE_',
): Record<string, string> {
  if (mode === 'local') {
    throw new Error(
      `"local" cannot be used as a mode name because it conflicts with the .local postfix for .env files.`,
    )
  }

  const prefixList = Array.isArray(prefixes) ? prefixes : [prefixes]
  const envFiles = ['.env', `.env.local`, `.env.${mode}`, `.env.${mode}.local`]

  const parsed: Record<string, string> = {}
  for (const file of envFiles) {
    const filePath = join(envDir, file)
    if (!isFile(filePath)) {
      continue
    }
    Object.assign(parsed, parse(readFileSync(filePath)))
  }

  // Let variables reference each other and existing process.env values, but
  // hand dotenv-expand a copy so the real process.env is never mutated
  expand({parsed, processEnv: {...process.env} as Record<string, string>})

  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (prefixList.some((prefix) => key.startsWith(prefix))) {
      env[key] = value
    }
  }

  // actual process.env variables with matching prefixes take priority
  for (const key of Object.keys(process.env)) {
    if (prefixList.some((prefix) => key.startsWith(prefix))) {
      env[key] = process.env[key] as string
    }
  }

  return env
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}
