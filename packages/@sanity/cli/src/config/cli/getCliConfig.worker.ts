import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {z} from 'zod'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const {configPath} = z.object({configPath: z.string()}).parse(workerData)

const {default: loadedConfig} = await import(configPath)

// This might throw on unserializable properties, but that's actually wanted in this
// case, since we _need_ any unserializable props (such as vite config functions)
parentPort.postMessage(loadedConfig)
