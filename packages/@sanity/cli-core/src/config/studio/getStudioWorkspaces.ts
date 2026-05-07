import {stat} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {isMainThread} from 'node:worker_threads'

import {firstValueFrom, of} from 'rxjs'
import {type Workspace} from 'sanity'

import {subdebug} from '../../debug.js'
import {isNotFoundError} from '../../errors/NotFoundError.js'
import {bundleStudioConfig} from '../../loaders/studio/bundleStudioConfig.js'
import {doImport} from '../../util/doImport.js'
import {getEmptyAuth} from '../../util/getEmptyAuth.js'
import {isRecord} from '../../util/isRecord.js'
import {resolveLocalPackage} from '../../util/resolveLocalPackage.js'
import {getCliConfig} from '../cli/getCliConfig.js'
import {findStudioConfigPath} from '../util/findStudioConfigPath.js'
import {isStudioConfig} from './isStudioConfig.js'

// We load the studio-config bundle via a CJS shim's `import()`. A direct
// `await import(...)` in this file would be rewritten by vite-node (the loader
// running this worker) into its own runner-based dynamic import — that
// re-SSR-transforms a 15MB bundle and adds ~3s. The shim lives in a `.cjs`
// file that vite-node never sees, so its `import()` is the host's untransformed
// dynamic import.
const require = createRequire(import.meta.url)
const nativeImport = require('../../util/nativeImport.cjs') as (
  url: string,
) => Promise<Record<string, unknown>>

const debug = subdebug('worker:getStudioWorkspaces')

/**
 * Resolves the workspaces from the studio config.
 *
 * NOTE: This function should only be called from a worker thread.
 *
 * @param configPath - The path to the studio config
 * @returns The workspaces
 * @internal
 */
export async function getStudioWorkspaces(configPath: string): Promise<Workspace[]> {
  if (isMainThread) {
    throw new Error('getStudioWorkspaces should only be called from a worker thread')
  }
  const isDirectory = (await stat(configPath)).isDirectory()
  if (isDirectory) {
    configPath = await findStudioConfigPath(configPath)
  }
  debug('Finding studio config path %s', configPath)

  const workDir = dirname(configPath)
  debug('Work dir %s', workDir)

  if (await hasCustomViteConfig(workDir)) {
    debug('Custom vite config detected, falling back to vite-node loader')
    return loadWorkspacesViaViteNode(configPath, workDir)
  }

  return loadWorkspacesViaBundle(configPath, workDir)
}

async function loadWorkspacesViaBundle(configPath: string, workDir: string): Promise<Workspace[]> {
  const bundlePath = await bundleStudioConfig({configPath, workDir})
  const bundle = (await nativeImport(pathToFileURL(bundlePath).href)) as {
    loadWorkspaces?: () => Promise<Workspace[]>
  }

  if (typeof bundle.loadWorkspaces !== 'function') {
    throw new TypeError(`Studio config bundle is missing the expected loadWorkspaces export`)
  }

  return bundle.loadWorkspaces()
}

/**
 * The pre-bundle code path: load the studio config through vite-node's per-module
 * SSR transform. Slower but honors arbitrary `cliConfig.vite` customizations.
 */
async function loadWorkspacesViaViteNode(
  configPath: string,
  workDir: string,
): Promise<Workspace[]> {
  let config = await doImport(configPath)
  if (!isStudioConfig(config)) {
    if (!('default' in config) || !isStudioConfig(config.default)) {
      throw new TypeError(`Invalid studio config format in "${configPath}"`)
    }
    config = config.default
  }

  const {resolveConfig} = await resolveLocalPackage<typeof import('sanity')>('sanity', workDir)
  if (typeof resolveConfig !== 'function') {
    throw new TypeError('Expected `resolveConfig` from `sanity` to be a function')
  }

  const rawWorkspaces = Array.isArray(config)
    ? config
    : [{...config, basePath: config.basePath || '/', name: config.name || 'default'}]
  const unauthedWorkspaces = rawWorkspaces.map((workspace) => ({
    ...workspace,
    auth: {state: of(getEmptyAuth())},
  }))

  return firstValueFrom(resolveConfig(unauthedWorkspaces))
}

async function hasCustomViteConfig(workDir: string): Promise<boolean> {
  try {
    const cliConfig = await getCliConfig(workDir)
    return typeof cliConfig?.vite === 'function' || isRecord(cliConfig?.vite)
  } catch (err) {
    if (isNotFoundError(err)) return false
    debug('Failed to read CLI config: %o', err)
    return false
  }
}
