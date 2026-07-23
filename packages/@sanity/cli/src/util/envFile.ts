import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {parse as parseDotenv} from 'dotenv'

/**
 * Keys that mark a directory as already belonging to a Sanity project. When any are present,
 * `sanity new`'s remint guard refuses (it won't overwrite credentials), so other surfaces (e.g.
 * `sanity init`) should not steer users toward `sanity new` here either. `SANITY_DATASET` is
 * excluded — it's a common exemplar variable.
 */
export const GUARDED_ENV_KEYS = [
  'SANITY_AUTH_TOKEN',
  'SANITY_PROJECT_ID',
  'SANITY_CLAIM_URL',
] as const

/**
 * Whether `.env` is already tracked by git in `dir`. Gitignore only affects untracked files, so a
 * tracked `.env` will still be committed no matter what `.gitignore` says — callers must warn and
 * tell the user to untrack it. Fails open to `false` (git missing, not a repo, `.env` untracked).
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
 * Ensure `.env` is gitignored in `dir`. `ignored` reports whether `.env` is definitely covered
 * afterwards; callers must warn when it is false, since a failed write can leave a token committable
 * and there is no way to distinguish that from success without it. `added` is true only when this
 * call wrote the entry (so "already ignored" stays quiet).
 */
export function ensureEnvGitignored(dir: string): {added: boolean; ignored: boolean} {
  try {
    const gitignorePath = path.join(dir, '.gitignore')
    const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : ''
    const alreadyIgnored = existing
      .split('\n')
      .some((line) => line.trim().replace(/^\//, '') === '.env')
    if (alreadyIgnored) return {added: false, ignored: true}

    const separator = existing && !existing.endsWith('\n') ? '\n' : ''
    fs.appendFileSync(gitignorePath, `${separator}.env\n`)
    return {added: true, ignored: true}
  } catch {
    return {added: false, ignored: false}
  }
}
