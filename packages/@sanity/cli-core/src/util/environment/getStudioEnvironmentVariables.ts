import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

import {moduleResolve} from 'import-meta-resolve'

/**
 * Loads the `getStudioEnvironmentVariables` function from the studio's
 * installed `sanity` package and returns the environment variables.
 *
 * This is used to ensure we're using the same version of environment variable
 * logic as the studio itself.
 *
 * @param rootPath - The root path of the Sanity Studio project
 * @returns Object containing studio environment variables
 * @internal
 */
export async function getStudioEnvironmentVariables(
  rootPath: string,
): Promise<Record<string, string>> {
  // Create a fake config URL - doesn't have to be correct, just need the root path
  const fakeConfigUrl = pathToFileURL(resolve(rootPath, 'sanity.config.mjs'))

  // Load `getStudioEnvironmentVariables` from the `sanity/cli` module installed
  // relative to where the studio is located, instead of resolving from where this CLI is
  // running, in order to ensure we're using the same version as the studio would.
  const sanityCliUrl = moduleResolve('sanity/cli', fakeConfigUrl)
  const {getStudioEnvironmentVariables: getEnvVars} = await import(sanityCliUrl.href)

  if (typeof getEnvVars !== 'function') {
    throw new TypeError(
      'Expected `getStudioEnvironmentVariables` from `sanity/cli` to be a function',
    )
  }

  // Get the environment variables for development mode
  return getEnvVars({cwd: rootPath, env: 'development'})
}
