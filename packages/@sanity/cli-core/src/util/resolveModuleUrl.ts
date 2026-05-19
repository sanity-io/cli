import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'

export function resolveModuleUrl(specifier: string, parentUrl: string | URL): URL {
  return pathToFileURL(createRequire(parentUrl).resolve(specifier))
}
