// Node-only build entry: the module-federation Vite plugins that
// `@sanity/cli-build`'s `getViteConfig` swaps in for a workbench app, plus the
// accessor the build command reads declared views/services from. The build
// needs no deploy guards, so its accessor is the bare resolver.
export {workbenchVitePlugins} from '../actions/build/vite/workbench-vite-plugins.js'
export {resolveWorkbenchApp as getWorkbench} from '../resolveWorkbenchApp.js'
