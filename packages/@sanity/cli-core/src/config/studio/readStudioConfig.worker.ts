import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {z} from 'zod'

import {doImport} from '../../util/doImport.js'
import {safeStructuredClone} from '../../util/safeStructuredClone.js'
import {getStudioWorkspaces} from './getStudioWorkspaces.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const {configPath, resolvePlugins} = z
  .object({configPath: z.string(), resolvePlugins: z.boolean()})
  .parse(workerData)

let {default: config} = await doImport(configPath)

if (resolvePlugins) {
  config = await getStudioWorkspaces(configPath)
}

parentPort.postMessage(safeStructuredClone(config))
