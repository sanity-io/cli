import {register} from 'tsx/esm/api'

const workerScript = process.env.TSX_WORKER_TASK_SCRIPT
const unregister = register({
  tsconfig: process.env.TSX_TSCONFIG_PATH || undefined,
})

await import(workerScript)

unregister()
