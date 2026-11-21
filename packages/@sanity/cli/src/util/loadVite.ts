/* eslint-disable eslint-js/no-restricted-syntax, import-js/no-extraneous-dependencies -- The feature has its own on-demand install. */
import {loadDeferredModule} from '@sanity/cli-core/loadDeferredModule'

import {deferredVersions} from '../generated/deferredVersions.js'

export async function loadVite(): Promise<typeof import('vite')> {
  return loadDeferredModule(
    'vite',
    deferredVersions.vite,
    'vite',
    import.meta.url,
    () => import('vite'),
  )
}
