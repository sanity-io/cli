import {dirname} from 'node:path'

import {firstValueFrom, of} from 'rxjs'
import {type Workspace} from 'sanity'

import {doImport} from '../../util/doImport.js'
import {getEmptyAuth} from '../../util/getEmptyAuth.js'
import {resolveLocalPackage} from '../../util/resolveLocalPackage.js'
import {isStudioConfig} from './isStudioConfig.js'

/**
 * Resolves the workspaces from the studio config.
 *
 * @param options - The options for the function
 * @returns The workspaces
 * @internal
 */
export async function getStudioWorkspaces(configPath: string): Promise<Workspace[]> {
  let config = await doImport(configPath)
  if (!isStudioConfig(config)) {
    if (!('default' in config) || !isStudioConfig(config.default)) {
      throw new TypeError(`Invalid studio config format in "${configPath}"`)
    }

    config = config.default
  }

  const workDir = dirname(configPath)
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

  return firstValueFrom(resolveConfig(unauthedWorkspaces))
}
