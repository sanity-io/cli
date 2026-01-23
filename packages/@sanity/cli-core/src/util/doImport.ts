// Only file that should be using dynamic import
import {pathToFileURL} from 'node:url'

/**
 * This function is a replacement for built in dynamic import
 * This handles the case for windows file paths especially for absolute paths.
 *
 * @param source - File path
 */
export function doImport(source: string) {
  // Absolute paths in windows are not valid URLs and are not supported by import().
  // We need to convert the path to a file URL.
  // See: https://github.com/nodejs/node/issues/31710
  // eslint-disable-next-line no-restricted-syntax
  return import(/^file:\/\//.test(source) ? source : pathToFileURL(source).href)
}
