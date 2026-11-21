/* eslint-disable eslint-js/no-restricted-syntax, import-js/no-extraneous-dependencies -- The feature has its own on-demand install. */
import {loadDeferredModule} from '@sanity/cli-core/loadDeferredModule'

import {deferredVersions} from '../generated/deferredVersions.js'

const packageName = '@sanity/cli-build'

const modules = {
  build: () => import('@sanity/cli-build/_internal/build'),
  extract: () => import('@sanity/cli-build/_internal/extract'),
  manifest: () => import('@sanity/cli-build/_internal/manifest'),
  worker: () => import('@sanity/cli-build/_internal/worker'),
}

type BuildModules = typeof modules

export async function loadCliBuild<K extends keyof BuildModules>(
  entry: K,
): Promise<Awaited<ReturnType<BuildModules[K]>>> {
  const specifier = `${packageName}/_internal/${entry}`
  return loadDeferredModule<Awaited<ReturnType<BuildModules[K]>>>(
    packageName,
    deferredVersions[packageName],
    specifier,
    import.meta.url,
    modules[entry] as () => Promise<Awaited<ReturnType<BuildModules[K]>>>,
  )
}
