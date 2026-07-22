import fs from 'node:fs'

import {parse as parseDotenv} from 'dotenv'

export interface EnvWriteResult {
  /** Whether the file was created by this write (as opposed to appended to). */
  created: boolean
  /** Keys already present in the file, left untouched. */
  skippedKeys: string[]
  /** Keys appended by this write, in the order given. */
  wroteKeys: string[]
}

function hasKey(contents: string, key: string): boolean {
  return new RegExp(String.raw`^\s*(?:export\s+)?${key}\s*=`, 'm').test(contents)
}

/**
 * Read the raw values of `keys` from the dotenv file at `envPath` — a deliberate direct file
 * read, because `process.env` is only populated from `.env` when a project root exists. Parsing
 * is delegated to `dotenv` (the same grammar the runtime's env injection ultimately uses via
 * vite's `loadEnv`), so what the guardrail reads is what a running command would see — quotes,
 * inline comments, `export` prefixes, multiline values, and duplicate keys (last one wins) all
 * behave identically in both places. Missing file, missing key, or an empty value → absent from
 * the result.
 */
export function readEnvValues(envPath: string, keys: string[]): Partial<Record<string, string>> {
  if (!fs.existsSync(envPath)) return {}
  const parsed = parseDotenv(fs.readFileSync(envPath, 'utf8'))

  const values: Partial<Record<string, string>> = {}
  for (const key of keys) {
    const value = parsed[key]?.trim()
    if (value) values[key] = value
  }
  return values
}

/**
 * Append `values` to the dotenv file at `envPath`, creating the file when missing. Keys already
 * present are never overwritten — the file may hold credentials the user or an agent put there —
 * they are reported back as `skippedKeys` instead. `banner` lines are written as `#` comments
 * above the appended block, so context (e.g. a claim URL) survives after the terminal closes.
 *
 * This is deliberately the CLI's *only* `.env` writer: the file is user-owned, so this codebase
 * never modifies or removes an existing line. When existing values need replacing (a re-mint
 * over old credentials), the CLI prints the new values and instructions instead of editing —
 * callers must not work around that by deleting lines first.
 */
export function appendEnvValues(
  envPath: string,
  values: Record<string, string>,
  options?: {banner?: string[]},
): EnvWriteResult {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : undefined

  const wroteKeys = Object.keys(values).filter((key) => !hasKey(existing ?? '', key))
  const skippedKeys = Object.keys(values).filter((key) => hasKey(existing ?? '', key))

  if (wroteKeys.length > 0) {
    const banner = (options?.banner ?? []).map((line) => `# ${line}`)
    const block = [...banner, ...wroteKeys.map((key) => `${key}="${values[key]}"`)].join('\n')
    const separator = existing ? (existing.endsWith('\n') ? '\n' : '\n\n') : ''
    fs.appendFileSync(envPath, `${separator}${block}\n`)
  }

  return {created: existing === undefined, skippedKeys, wroteKeys}
}
