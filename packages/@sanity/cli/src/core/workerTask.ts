import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {Worker, type WorkerOptions} from 'node:worker_threads'

import {type RequireProps} from '../typeHelpers.js'

/**
 * Executes a worker file and once it has received a single message will resolve the
 * returned promise with that message. If you are expecting multiple messages, you will
 * have to implement another method ;)
 *
 * Automatically handles running typescript files in development mode and javascript
 * files in production.
 *
 * @param filePath - Path to the worker file
 * @param options - Options to pass to the worker
 * @returns A promise that resolves with the message from the worker
 * @throws If the file does not exist
 * @throws If the worker exits with a non-zero code
 * @internal
 */
export function workerTask(
  filePath: string,
  options: RequireProps<WorkerOptions, 'name'>,
): Promise<unknown> {
  const worker = new WorkerThread(filePath, options)

  return new Promise((resolve, reject) => {
    worker.addListener('error', function onWorkerError(err) {
      reject(new Error(`Fail to load file through worker: ${err.message}`))
      cleanup()
    })
    worker.addListener('exit', function onWorkerExit(code) {
      if (code > 0) {
        reject(new Error(`Worker exited with code ${code}`))
      }
    })
    worker.addListener('messageerror', function onWorkerMessageError(err) {
      reject(new Error(`Fail to parse message from worker: ${err}`))
      cleanup()
    })
    worker.addListener('message', function onWorkerMessage(message) {
      resolve(message)
      cleanup()
    })

    function cleanup() {
      // Allow the worker a _bit_ of time to clean up, but ensure that we don't have
      // lingering processes hanging around forever if the worker doesn't exit on its
      // own.
      setImmediate(() => worker.terminate())
    }
  })
}

class WorkerThread extends Worker {
  constructor(filePath: string, options: RequireProps<WorkerOptions, 'name'>) {
    if (!filePath.endsWith('.js')) {
      if (filePath.endsWith('.ts')) {
        throw new Error(
          'WorkerThread should always point to `.js` file - `.ts` is automatically used if it exists!',
        )
      }

      throw new Error(`Worker thread should always point to a \`.js\` file, got ${filePath}`)
    }

    const blankSpacePath = fileURLToPath(import.meta.resolve('ts-blank-space/register'))
    const tsPath = filePath.replace(/\.js$/, '.ts')
    const tsExists = existsSync(tsPath)

    let workerPath = filePath
    const workerOptions = {...options}
    if (tsExists) {
      // We assume that if the ts file exists, we want to use it. This makes sense in
      // the context of development; running the script from `foo.ts` and wanting to
      // execute `thread.ts`. If however the script is running from the compiled output
      // (`foo.js`), the sibling `thread.ts` should _not_ exist, and so it will use the
      // compiled `thread.js` instead.
      workerPath = tsPath
      workerOptions.execArgv = ['--import', blankSpacePath, ...(workerOptions.execArgv || [])]
    } else if (!existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`)
    }

    super(workerPath, workerOptions)
  }
}
