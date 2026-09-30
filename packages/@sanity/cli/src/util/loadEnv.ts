import {readFileSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {parseEnv} from 'node:util'

import {getEnvs} from '@voidzero-dev/vite-task-client'
import {expand} from 'dotenv-expand'

/**
 * Load Vite-compatible environment files without loading the native build toolchain.
 * @public
 */
export const loadEnv: typeof import('vite').loadEnv = (mode, envDir, prefixes = 'VITE_') => {
  if (mode === 'local') {
    throw new Error(
      '"local" cannot be used as a mode name because it conflicts with the .local postfix for .env files.',
    )
  }
  const filters = Array.isArray(prefixes) ? prefixes : [prefixes]
  const files = envDir === false ? [] : ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
  const parsed: Record<string, string> = Object.fromEntries(
    files.flatMap((file) => {
      const path = join(envDir || '.', file)
      const stat = statSync(path, {throwIfNoEntry: false})
      if (!stat || (!stat.isFile() && !stat.isFIFO())) return []
      return Object.entries(parseEnv(readFileSync(path, 'utf8'))).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      )
    }),
  )
  for (const [input, output] of [
    ['NODE_ENV', 'VITE_USER_NODE_ENV'],
    ['BROWSER', 'BROWSER'],
    ['BROWSER_ARGS', 'BROWSER_ARGS'],
  ]) {
    if (parsed[input] && process.env[output] === undefined) process.env[output] = parsed[input]
  }
  // Vite supports references to variables declared later in the merged files.
  const processEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  expand({parsed, processEnv: {...parsed, ...processEnv}})
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (filters.some((prefix) => key.startsWith(prefix))) env[key] = value
  }
  for (const prefix of filters) Object.assign(env, getEnvs({prefix}))
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && filters.some((prefix) => key.startsWith(prefix))) env[key] = value
  }
  return env
}
