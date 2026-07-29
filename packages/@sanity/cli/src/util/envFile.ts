import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {parse as parseDotenv} from 'dotenv'

/** Keys that mark the current directory as already belonging to a Sanity project. */
export const GUARDED_ENV_KEYS = ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID'] as const

/**
 * Whether `.env` is already tracked by git in `dir`. Gitignore only affects untracked files, so a
 * tracked `.env` remains committable. Fails open to `false` when git is unavailable or absent.
 */
export function isEnvTracked(dir: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '.env'], {cwd: dir, stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}

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

export interface EnvKeyInspection {
  /** Keys present as assignment lines whose effective dotenv value is absent or blank. */
  blankKeys: string[]
  /** Keys with assignment syntax in the file (including `export KEY=`), blank or not. */
  presentKeys: string[]
  /** Effective nonblank values, following dotenv grammar (last assignment wins). */
  values: Partial<Record<string, string>>
}

export function inspectEnvKeys(envPath: string, keys: readonly string[]): EnvKeyInspection {
  if (!fs.existsSync(envPath)) return {blankKeys: [], presentKeys: [], values: {}}
  const contents = fs.readFileSync(envPath, 'utf8')
  const parsed = parseDotenv(contents)

  const presentKeys = keys.filter((key) => hasKey(contents, key))
  const values: Partial<Record<string, string>> = {}
  for (const key of keys) {
    const value = parsed[key]?.trim()
    if (value) values[key] = value
  }

  return {
    blankKeys: presentKeys.filter((key) => values[key] === undefined),
    presentKeys,
    values,
  }
}

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

/**
 * Ensure `pattern` is gitignored in `dir`. `ignored` is false when a failed write may have left the
 * file committable; `added` is true only when this call wrote the entry.
 */
export function ensureEnvGitignored(
  dir: string,
  pattern: string = '.env',
): {added: boolean; ignored: boolean} {
  try {
    const gitignorePath = path.join(dir, '.gitignore')
    const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : ''
    const covers = new Set(pattern === '.env' ? ['.env', '/.env', '.env*'] : [pattern])
    const alreadyIgnored = existing.split('\n').some((line) => covers.has(line.trim()))
    if (alreadyIgnored) return {added: false, ignored: true}

    const separator = existing && !existing.endsWith('\n') ? '\n' : ''
    fs.appendFileSync(gitignorePath, `${separator}${pattern}\n`)
    return {added: true, ignored: true}
  } catch {
    return {added: false, ignored: false}
  }
}
