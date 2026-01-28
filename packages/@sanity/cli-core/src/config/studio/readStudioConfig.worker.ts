import {pathToFileURL} from 'node:url'
import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {moduleResolve} from 'import-meta-resolve'
import {firstValueFrom, of} from 'rxjs'
import {z} from 'zod'

import {doImport} from '../../util/doImport.js'
import {getEmptyAuth} from '../../util/getEmptyAuth.js'
import {safeStructuredClone} from '../../util/safeStructuredClone.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const {configPath, resolvePlugins} = z
  .object({configPath: z.string(), resolvePlugins: z.boolean()})
  .parse(workerData)

let {default: config} = await doImport(configPath)

if (resolvePlugins) {
  // If we need to resolve plugins, we need to import and use the `resolveConfig`
  // function from the `sanity` package. This package should be installed in the users'
  // studio project, not as part of the CLI - so we need to resolve the full path of the
  // Sanity package relative to the studio.
  const configUrl = pathToFileURL(configPath)

  const sanityUrl = await moduleResolve('sanity', configUrl)
  const {resolveConfig} = await doImport(sanityUrl.href)
  if (typeof resolveConfig !== 'function') {
    throw new TypeError('Expected `resolveConfig` from `sanity` to be a function')
  }

  // We will also want to stub out some configuration - we don't need to resolve the
  // users' logged in state, for instance - so let's disable the auth implementation.
  const workspaces = Array.isArray(config) ? config : [config]
  workspaces.map((workspace) => {
    workspace.auth = {state: of(getEmptyAuth())}
  })

  config = await firstValueFrom(resolveConfig(config))
}

parentPort.postMessage(safeStructuredClone(config))

// Explicitly exit the process to avoid any dangling references from keeping
// the process alive after resolving it's main task
setImmediate(() => {
  process.exit(1)
})
