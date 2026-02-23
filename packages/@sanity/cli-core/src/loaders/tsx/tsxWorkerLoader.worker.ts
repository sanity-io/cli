import {importModule} from '../../util/importModule.js'

const workerScript = process.env.TSX_WORKER_TASK_SCRIPT

if (workerScript) {
  await importModule(workerScript, {
    tsconfigPath: process.env.TSX_TSCONFIG_PATH,
  })
} else {
  throw new Error('`TX_WORKER_TASK_SCRIPT` not defined')
}
