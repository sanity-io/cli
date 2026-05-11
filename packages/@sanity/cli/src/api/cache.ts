import fs from 'node:fs/promises'
import {homedir} from 'node:os'
import path from 'node:path'

/**
 * On-disk cache for the docs OpenAPI specs.
 *
 * Layout (rooted at `SANITY_CLI_CACHE_PATH` for tests, otherwise
 * `~/.config/sanity[-staging]/cache`):
 *
 * ```
 *   <root>/api/
 *     revisions.json        {slug → revision} — invalidation truth
 *     specs/<slug>.yaml     raw OpenAPI YAML, written on fetch
 * ```
 *
 * Subsequent phases add `meta.json` (TTL fallback) and a parsed-ops
 * cache. Phase 1 ships only what's strictly needed.
 */

function getCacheDir(): string {
  if (process.env.SANITY_CLI_CACHE_PATH) {
    return path.join(process.env.SANITY_CLI_CACHE_PATH, 'api')
  }
  const sanityEnvSuffix = process.env.SANITY_INTERNAL_ENV === 'staging' ? '-staging' : ''
  return path.join(homedir(), '.config', `sanity${sanityEnvSuffix}`, 'cache', 'api')
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, {recursive: true})
}

export async function readRevisions(): Promise<Record<string, string>> {
  const file = path.join(getCacheDir(), 'revisions.json')
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export async function writeRevisions(map: Record<string, string>): Promise<void> {
  const dir = getCacheDir()
  await ensureDir(dir)
  await fs.writeFile(path.join(dir, 'revisions.json'), JSON.stringify(map, null, 2), 'utf8')
}

export async function readSpec(slug: string): Promise<string | null> {
  const file = path.join(getCacheDir(), 'specs', `${slug}.yaml`)
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
}

export async function writeSpec(slug: string, yaml: string): Promise<void> {
  const dir = path.join(getCacheDir(), 'specs')
  await ensureDir(dir)
  await fs.writeFile(path.join(dir, `${slug}.yaml`), yaml, 'utf8')
}
