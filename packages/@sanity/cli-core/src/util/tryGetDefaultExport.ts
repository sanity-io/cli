import {isRecord} from './isRecord.js'

/**
 * Try to get the default export of a module of the cli config.
 * This can be either ESM or CJS.
 */
export function tryGetDefaultExport(mod: unknown) {
  // If the module is a record and has a default property, return the default property
  if (isRecord(mod) && 'default' in mod) {
    // If the default property is a record and has a default property, return the default property
    // This is for CJS modules
    if (isRecord(mod.default) && 'default' in mod.default) {
      return mod.default.default
    }

    return mod.default
  }

  return null
}
