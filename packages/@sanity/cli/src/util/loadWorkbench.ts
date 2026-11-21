/* eslint-disable eslint-js/no-restricted-syntax, import-js/no-extraneous-dependencies -- The feature has its own on-demand install. */
import {loadDeferredModule} from '@sanity/cli-core/loadDeferredModule'

import {deferredVersions} from '../generated/deferredVersions.js'

const packageName = '@sanity/workbench-cli'

const modules = {
  build: () => import('@sanity/workbench-cli/build'),
  deploy: () => import('@sanity/workbench-cli/deploy'),
  dev: () => import('@sanity/workbench-cli/dev'),
  preview: () => import('@sanity/workbench-cli/preview'),
  undeploy: () => import('@sanity/workbench-cli/undeploy'),
}

type WorkbenchModules = typeof modules

export async function loadWorkbench<K extends keyof WorkbenchModules>(
  entry: K,
): Promise<Awaited<ReturnType<WorkbenchModules[K]>>> {
  const specifier = `${packageName}/${entry}`
  return loadDeferredModule<Awaited<ReturnType<WorkbenchModules[K]>>>(
    packageName,
    deferredVersions[packageName],
    specifier,
    import.meta.url,
    modules[entry] as () => Promise<Awaited<ReturnType<WorkbenchModules[K]>>>,
  )
}
