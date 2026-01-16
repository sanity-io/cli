import {parentPort, workerData} from 'node:worker_threads'

import {getAndWriteJourneySchema} from '../util/journeyConfig.js'

try {
  await getAndWriteJourneySchema(workerData)
  parentPort?.postMessage({type: 'success'})
} catch (error) {
  parentPort?.postMessage({error, type: 'error'})
}
