import {readFileSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {parseEnv} from 'node:util'

import {expand} from 'dotenv-expand'

/** Loads the project's mode-specific environment without starting a build. */
export function loadEnv(
  mode: string,
  envDir: false | string,
  prefixes: string | string[] = 'VITE_',
): Record<string, string> {
  if (mode === 'local') {
    throw new Error(
      '"local" cannot be used as a mode name because it conflicts with the .local postfix for .env files.',
    )
  }

  const files =
    envDir === false
      ? []
      : ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`].map((file) =>
          join(envDir, file),
        )
  const parsed = Object.fromEntries(
    files.flatMap((path) => {
      const stat = statSync(path, {throwIfNoEntry: false})
      return stat?.isFile() || stat?.isFIFO()
        ? definedEntries(parseEnv(readFileSync(path, 'utf8')))
        : []
    }),
  )

  if (parsed.NODE_ENV) process.env.VITE_USER_NODE_ENV ??= parsed.NODE_ENV
  if (parsed.BROWSER) process.env.BROWSER ??= parsed.BROWSER
  if (parsed.BROWSER_ARGS) process.env.BROWSER_ARGS ??= parsed.BROWSER_ARGS

  const processEnv = Object.fromEntries(definedEntries(process.env))
  expand({parsed, processEnv})
  const accepted = Array.isArray(prefixes) ? prefixes : [prefixes]
  return Object.fromEntries(
    Object.entries({...parsed, ...process.env}).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && accepted.some((prefix) => entry[0].startsWith(prefix)),
    ),
  )
}

function definedEntries(environment: Record<string, string | undefined>): [string, string][] {
  return Object.entries(environment).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  )
}
