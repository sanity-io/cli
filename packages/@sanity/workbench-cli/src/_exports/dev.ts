// Node-only dev entry: the workbench dev-server registry the CLI's dev
// orchestration drives. It tracks running studio/app dev servers (single
// instance via a lock + PID-liveness), and the workbench host watches it to
// render local panels/services without a deploy. The CLI owns the orchestration
// (starting servers, extracting manifests); this package owns the registry it
// registers into and watches.
export {canonicalizeWatchDir} from '../actions/dev/canonicalizeWatchDir.js'
export {
  acquireWorkbenchLock,
  type DevServerManifest,
  getRegisteredServers,
  readWorkbenchLock,
  registerDevServer,
  watchRegistry,
} from '../actions/dev/registry.js'
