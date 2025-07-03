import {tsImport} from 'tsx/esm/api'

const workerScript = process.env.TSX_WORKER_TASK_SCRIPT

if (workerScript) {
  await tsImport(workerScript, {
    parentURL: import.meta.url,
    tsconfig: process.env.TSX_TSCONFIG_PATH,
  })
} else {
  throw new Error('`TX_WORKER_TASK_SCRIPT` not defined')
}
