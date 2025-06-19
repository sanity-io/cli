import {parentPort, workerData} from 'node:worker_threads'

import {renderDocumentWorker} from './renderDocumentWorker/renderDocumentWorker.js'

// If we're not in a worker thread, throw an error
if (!parentPort || !workerData) {
  throw new Error('Must be used as a Worker with a valid options object in worker data')
}

renderDocumentWorker(parentPort, workerData)
