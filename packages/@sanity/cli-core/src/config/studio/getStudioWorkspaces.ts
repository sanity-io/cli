import {stat} from 'node:fs/promises'
import {dirname} from 'node:path'
import {isMainThread} from 'node:worker_threads'

import {firstValueFrom, of} from 'rxjs'
import {type Workspace} from 'sanity'

import {subdebug} from '../../debug.js'
import {doImport} from '../../util/doImport.js'
import {getEmptyAuth} from '../../util/getEmptyAuth.js'
import {resolveLocalPackage} from '../../util/resolveLocalPackage.js'
import {findStudioConfigPath} from '../util/findStudioConfigPath.js'
import {isStudioConfig} from './isStudioConfig.js'

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
  let config = await doImport(configPath)

  debug('Imported config %o', config)
  if (!isStudioConfig(config)) {
    if (!('default' in config) || !isStudioConfig(config.default)) {
      debug('Invalid studio config format in "%s"', configPath)
      throw new TypeError(`Invalid studio config format in "${configPath}"`)
    }

    config = config.default
  }

  const workDir = dirname(configPath)
  debug('Work dir %s', workDir)
  const {resolveConfig} = await resolveLocalPackage<typeof import('sanity')>('sanity', workDir)
  if (typeof resolveConfig !== 'function') {
    throw new TypeError('Expected `resolveConfig` from `sanity` to be a function')
  }

  // We will also want to stub out some configuration - we don't need to resolve the
  // users' logged in state, for instance - so let's disable the auth implementation.
  const rawWorkspaces = Array.isArray(config)
    ? config
    : [{...config, basePath: config.basePath || '/', name: config.name || 'default'}]

  const unauthedWorkspaces = rawWorkspaces.map((workspace) => ({
    ...workspace,
    auth: {state: of(getEmptyAuth())},
  }))

  debug('Unauthed workspaces %o', unauthedWorkspaces)

  return firstValueFrom(resolveConfig(unauthedWorkspaces))
}
