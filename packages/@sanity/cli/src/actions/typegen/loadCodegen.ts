/* eslint-disable eslint-js/no-restricted-syntax, import-js/no-extraneous-dependencies -- The feature has its own on-demand install. */
import {loadDeferredModule} from '@sanity/cli-core/loadDeferredModule'

import {deferredVersions} from '../../generated/deferredVersions.js'

export async function loadCodegen(): Promise<typeof import('@sanity/codegen')> {
  const name = '@sanity/codegen'
  return loadDeferredModule(
    name,
    deferredVersions[name],
    name,
    import.meta.url,
    () => import('@sanity/codegen'),
  )
}
