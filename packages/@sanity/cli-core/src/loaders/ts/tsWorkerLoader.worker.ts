import {importModule} from '../../util/importModule.js'

const workerScript = process.env.TS_WORKER_TASK_SCRIPT

if (workerScript) {
  await importModule(workerScript)
} else {
  throw new Error('`TS_WORKER_TASK_SCRIPT` not defined')
}
