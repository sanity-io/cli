// Node-only dev entry: the workbench dev orchestration the CLI delegates to.
// `startWorkbenchDev` starts the singleton workbench server, wires both it and
// the injected app/studio server into the dev-server registry, and owns their
// teardown. The registry, interface model, and orchestration are internal now,
// reached only through this entry.
export {startWorkbenchDev, type StartWorkbenchDevOptions} from '../actions/dev/startWorkbenchDev.js'
