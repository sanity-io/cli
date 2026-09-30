import {createHash} from 'node:crypto'
import {existsSync} from 'node:fs'
import {mkdir, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {arch, homedir, platform} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

import {doImport} from '@sanity/cli-core/util'
import {spinner} from '@sanity/cli-core/ux'
import {familySync} from 'detect-libc'
import {execa} from 'execa'
import {moduleResolve} from 'import-meta-resolve'

const pending = new Map<string, Promise<string>>()

/** Cache exact command dependency versions locally when first needed. */
export function ensureToolchain(dependencies: Record<string, string>): Promise<string> {
  const sorted = Object.fromEntries(
    Object.entries(dependencies).toSorted(([a], [b]) => a.localeCompare(b)),
  )
  const hash = createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16)
  const system = platform()
  const key = `${system}-${arch()}-${system === 'linux' ? familySync() : 'native'}-${hash}`
  const cache = join(
    process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
    'sanity',
    'cli-toolchains',
    key,
  )
  let result = pending.get(cache)
  if (!result) {
    result = installToolchain(cache, sorted, hash).catch((error) => {
      pending.delete(cache)
      throw error
    })
    pending.set(cache, result)
  }
  return result
}

async function isReady(cache: string, hash: string): Promise<boolean> {
  try {
    return (await readFile(join(cache, '.ready'), 'utf8')) === hash
  } catch {
    return false
  }
}

async function installToolchain(
  cache: string,
  dependencies: Record<string, string>,
  hash: string,
): Promise<string> {
  if (await isReady(cache, hash)) return cache
  if (existsSync(cache)) {
    if (await isReady(cache, hash)) return cache
    throw new Error(
      `Command tools cache is incomplete: ${cache}\nRemove this directory and run the command again.`,
    )
  }
  const parent = join(cache, '..')
  await mkdir(parent, {recursive: true})
  const stage = await mkdtemp(join(parent, 'install-'))
  const spin = spinner('Installing command tools').start()
  try {
    await writeFile(join(stage, 'package.json'), JSON.stringify({dependencies, private: true}))
    await execa(
      'npm',
      ['install', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund'],
      {
        cwd: stage,
        env: {npm_config_cache: join(stage, '.npm'), npm_config_update_notifier: 'false'},
        timeout: 300_000,
      },
    )
    await rm(join(stage, '.npm'), {force: true, recursive: true})
    await writeFile(join(stage, '.ready'), hash)
    try {
      await rename(stage, cache)
    } catch (error) {
      // Another process may have completed the same installation first.
      if (!(await isReady(cache, hash))) throw error
    }
    spin.succeed()
    return cache
  } catch (error) {
    spin.fail()
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Couldn't install command tools: ${message}\nCheck your npm registry access and run the command again.`,
      {cause: error},
    )
  } finally {
    await rm(stage, {force: true, recursive: true})
  }
}

/** Imported by package-time adapters for deferred command dependencies. */
export async function loadToolchainModule(
  specifier: string,
  dependencies: Record<string, string>,
): Promise<Record<string, unknown>> {
  const cache = await ensureToolchain(dependencies)
  const url = moduleResolve(specifier, pathToFileURL(join(cache, 'entry.js')))
  return doImport(url.href)
}
