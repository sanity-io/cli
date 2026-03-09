import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, resolveLocalPackage} from '@sanity/cli-core'

import {extractGraphQLAPIsWorker, type ExtractWorkerData} from './extractGraphQLAPIs.js'

if (isMainThread || !parentPort) {
  throw new Error('This module must be run as a worker thread')
}

await extractGraphQLAPIsWorker(parentPort, workerData as ExtractWorkerData, {
  getStudioWorkspaces,
  resolveLocalPackage,
})
