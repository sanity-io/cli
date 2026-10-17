import {doImport} from '../../util/doImport.js'

// Keep the existing loader unless the Studio explicitly opts into bundling.
const loader =
  process.env.SANITY_CLI_STUDIO_WORKER_BUNDLE === 'true'
    ? 'studioWorkerBundleLoader.worker.js'
    : 'studioWorkerModuleLoader.worker.js'

await doImport(new URL(loader, import.meta.url).href)
