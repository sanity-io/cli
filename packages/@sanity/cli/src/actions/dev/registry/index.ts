/**
 * Registry of running dev server processes plus the workbench singleton lock.
 *
 * - `registry.ts` — the store: one `<pid>.json` manifest per live dev server
 * - `workbenchLock.ts` — the `workbench.lock` file guarding "one workbench per machine"
 * - `processLiveness.ts` — PID liveness + start-time verification (PID-reuse detection)
 */
export {__resetStartTimeCacheForTesting} from './processLiveness.js'
export {
  type DevServerManifest,
  getRegisteredServers,
  registerDevServer,
  watchRegistry,
} from './registry.js'
export {acquireWorkbenchLock, readWorkbenchLock} from './workbenchLock.js'
