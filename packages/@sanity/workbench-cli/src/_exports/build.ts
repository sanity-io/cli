// Node-only build entry: the module-federation Vite plugins that
// `@sanity/cli-build`'s `getViteConfig` swaps in for a workbench app, plus the
// resolver the build reads declared views/web workers from. The build needs no
// deploy-time guards, so it takes the bare `resolveWorkbenchApp` — the guarded
// view (`getWorkbench`) is the deploy entry's export.

export {
  RESOURCE_BINDINGS_CHUNK_NAME,
  RESOURCE_BINDINGS_ENTRY_IMPORT,
  RESOURCE_BINDINGS_FILENAME,
  RESOURCE_BINDINGS_MODULE_SOURCE,
  RESOURCE_BINDINGS_TOKEN,
  resourceBindingsChunkFileName,
  resourceBindingsCodeSplittingGroup,
} from '../actions/build/resource-bindings.js'
export {workbenchOptimizeDeps} from '../actions/build/vite/optimize-deps.js'
export {workbenchVitePlugins} from '../actions/build/vite/workbench-vite-plugins.js'
export {buildAppId} from '../appId.js'
export {resolveWorkbenchApp, type WorkbenchExposes} from '../resolveWorkbenchApp.js'
export {type ResolvedMediaLibraryConfig, resolveWorkbenchConfig} from '../resolveWorkbenchConfig.js'
