import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {subdebug} from '@sanity/cli-core'

import {type BuildStudioSchemasAndManifestsWorkerMessage} from './buildStudioSchemasAndManifests.js'
import {buildStudioSchemasAndManifestsWorkerData} from './types.js'
import {extractValidationFromSchemaError} from './utils/extractValidationFromSchemaError.js'
import {workerBuildStudioSchemasAndManifests} from './workerBuildStudioSchemasAndManifests.js'

const debug = subdebug('buildStudioSchemasAndManifests.worker')

async function main() {
  if (isMainThread || !parentPort) {
    throw new Error('Should only be run in a worker!')
  }

  const options = buildStudioSchemasAndManifestsWorkerData.parse(workerData)

  try {
    const message = await workerBuildStudioSchemasAndManifests(options)

    parentPort.postMessage(message)
  } catch (error) {
    debug('Error deploying studio schemas and manifests', error)
    const validation = await extractValidationFromSchemaError(error, options.workDir)
    parentPort.postMessage({
      error: error instanceof Error ? error.message : String(error),
      type: 'error',
      validation,
    } satisfies BuildStudioSchemasAndManifestsWorkerMessage)
  }
}

await main()
