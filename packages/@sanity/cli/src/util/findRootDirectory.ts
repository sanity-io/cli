import {access} from 'node:fs/promises'
import {join} from 'node:path'

import {readJsonFile} from './readJsonFile.js'

/**
 * Result of finding the root directory
 *
 * @internal
 */
export interface RootDirectoryResult {
  directory: string
  type: 'blueprint' | 'none' | 'studio'
}

/**
 * Resolve project root directory and type, falling back to cwd if it cannot be found.
 *
 * Project root is either:
 * - `blueprint` - A blueprints root (containing `blueprint.(ts|js)`)
 * - `studio` - A pre-blueprints Sanity studio root (containing `sanity.config.(ts|js)`)
 * - `none` - No project root found, using cwd
 *
 * If a Sanity Studio v2 root is found (containing `sanity.json` with `root: true`),
 * an error is thrown, as v2 is no longer supported.
 *
 * @internal
 */
export async function findRootDirectory(cwd: string): Promise<RootDirectoryResult> {
  try {
    const projectRoot = await resolveProjectRoot(cwd)
    return projectRoot || {directory: cwd, type: 'none'}
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : `${err}`
    throw new Error(`Error occurred trying to resolve project root:\n${message}`)
  }
}

async function hasStudioConfig(basePath: string): Promise<boolean> {
  const [jsStudio, tsStudio, v2Studio] = await Promise.all([
    fileExists(join(basePath, 'sanity.config.js')),
    fileExists(join(basePath, 'sanity.config.ts')),
    isSanityV2StudioRoot(basePath),
  ])

  if (v2Studio) {
    throw new Error('Sanity Studio v2 detected, which is no longer supported')
  }

  return jsStudio || tsStudio
}

async function hasBlueprint(basePath: string): Promise<boolean> {
  const [jsBlueprint, tsBlueprint] = await Promise.all([
    fileExists(join(basePath, 'blueprint.js')),
    fileExists(join(basePath, 'blueprint.ts')),
  ])

  return jsBlueprint || tsBlueprint
}

async function resolveProjectRoot(
  basePath: string,
  iterations = 0,
): Promise<false | RootDirectoryResult> {
  const [studio, blueprint] = await Promise.all([hasStudioConfig(basePath), hasBlueprint(basePath)])

  if (studio) {
    return {directory: basePath, type: 'studio'}
  }

  if (blueprint) {
    return {directory: basePath, type: 'blueprint'}
  }

  const parentDir = join(basePath, '..')
  if (parentDir === basePath || iterations > 50) {
    // Reached root (or max depth), give up
    return false
  }

  return resolveProjectRoot(parentDir, iterations + 1)
}

async function isSanityV2StudioRoot(basePath: string): Promise<boolean> {
  try {
    const sanityJson = await readJsonFile(join(basePath, 'sanity.json'))
    const isRoot = Boolean(sanityJson?.root)
    return isRoot
  } catch {
    return false
  }
}

function fileExists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false,
  )
}
