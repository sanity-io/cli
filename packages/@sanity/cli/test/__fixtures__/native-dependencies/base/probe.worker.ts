import {parentPort} from 'node:worker_threads'

import result from './sanity.config'

parentPort.postMessage(result)
