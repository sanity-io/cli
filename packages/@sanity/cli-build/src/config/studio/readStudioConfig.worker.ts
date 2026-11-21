import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces} from '@sanity/cli-core/config'
import {subdebug} from '@sanity/cli-core/debug'
import {doImport, safeStructuredClone} from '@sanity/cli-core/util'
import {z} from 'zod/mini'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const debug = subdebug('readStudioConfig.worker')

const {configPath, resolvePlugins} = z
  .object({configPath: z.string(), resolvePlugins: z.boolean()})
  .parse(workerData)

debug('Parsing config path %s', configPath)

let {default: config} = await doImport(configPath)

debug('Imported config %o', config)

if (resolvePlugins) {
  debug('Resolving workspaces')
  config = await getStudioWorkspaces(configPath)
  debug('Resolved workspaces %o', config)
}

parentPort.postMessage(safeStructuredClone(config))
