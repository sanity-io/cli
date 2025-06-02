import fs from 'node:fs'
import path from 'node:path'

import {buildDebug} from '../buildDebug.js'

function getPossibleDocumentComponentLocations(studioRootPath: string): string[] {
  return [path.join(studioRootPath, '_document.js'), path.join(studioRootPath, '_document.tsx')]
}

/**
 * @internal
 */
export async function tryLoadDocumentComponent(studioRootPath: string) {
  const locations = getPossibleDocumentComponentLocations(studioRootPath)

  for (const componentPath of locations) {
    buildDebug('Trying to load document component from %s', componentPath)
    try {
      const component = await import(componentPath)

      return {
        component,
        modified: Math.floor(fs.statSync(componentPath)?.mtimeMs),
        path: componentPath,
      }
    } catch (err) {
      // Allow "not found" errors
      if (err.code !== 'ERR_MODULE_NOT_FOUND') {
        buildDebug('Failed to load document component: %s', err.message)
        throw err
      }

      buildDebug('Document component not found at %s', componentPath)
    }
  }

  return null
}
