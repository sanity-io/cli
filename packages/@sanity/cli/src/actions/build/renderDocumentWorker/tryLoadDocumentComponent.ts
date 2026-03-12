import fs from 'node:fs'

import {doImport} from '@sanity/cli-core'

import {buildDebug} from '../buildDebug.js'
import {getPossibleDocumentComponentLocations} from '../getPossibleDocumentComponentLocations.js'

/**
 * @internal
 */
export async function tryLoadDocumentComponent(studioRootPath: string) {
  const locations = getPossibleDocumentComponentLocations(studioRootPath)

  for (const componentPath of locations) {
    buildDebug('Trying to load document component from %s', componentPath)
    try {
      const component = await doImport(componentPath)

      return {
        component,
        modified: Math.floor(fs.statSync(componentPath)?.mtimeMs),
        path: componentPath,
      }
    } catch (err) {
      // Allow "not found" errors
      if (!(err instanceof Error) || !('code' in err) || err.code !== 'ERR_MODULE_NOT_FOUND') {
        buildDebug(
          'Failed to load document component: %s',
          err instanceof Error ? err.message : String(err),
        )
        throw err
      }

      buildDebug('Document component not found at %s', componentPath)
    }
  }

  return null
}
