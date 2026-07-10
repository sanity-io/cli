// Node-only build entry: the module-federation Vite plugins that
// `@sanity/cli-build`'s `getViteConfig` swaps in for a workbench app, plus the
// resolver the build reads declared views/services from. The build needs no
// deploy-time guards, so it takes the bare `resolveWorkbenchApp` — the guarded
// view (`getWorkbench`) is the deploy entry's export.

export {buildWorkbenchHost} from '../actions/build/buildWorkbenchHost.js'
export {workbenchVitePlugins} from '../actions/build/vite/workbench-vite-plugins.js'
export {resolveWorkbenchApp, type WorkbenchExposes} from '../resolveWorkbenchApp.js'
