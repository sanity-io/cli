import {join} from 'node:path'

import {readJsonFile} from '../../util/readJsonFile.js'

/**
 * Checks for a `sanity.json` file with `"root": true` in the given directory.
 *
 * @param basePath - The base path to look for a `sanity.json` in
 * @returns Resolves to true if a `sanity.json` with `"root": true` is found, false otherwise
 * @internal
 */
export async function isSanityV2StudioRoot(basePath: string): Promise<boolean> {
  try {
    const sanityJson = await readJsonFile(join(basePath, 'sanity.json'))
    const isRoot = Boolean(sanityJson?.root)
    return isRoot
  } catch {
    return false
  }
}
