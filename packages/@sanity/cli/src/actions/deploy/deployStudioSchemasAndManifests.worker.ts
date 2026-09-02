import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {deployStudioSchemasAndManifestsWorker} from './deployStudioSchemasAndManifestsWorker.js'

async function main() {
  if (isMainThread || !parentPort) {
    throw new Error('Should only be run in a worker!')
  }

  await deployStudioSchemasAndManifestsWorker(parentPort, workerData)
}

await main()
