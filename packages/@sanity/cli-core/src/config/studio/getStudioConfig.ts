import {findStudioConfigPath} from '../util/findStudioConfigPath.js'
import {
  type RawStudioConfig,
  readStudioConfig,
  type ReadStudioConfigOptions,
  type ResolvedStudioConfig,
} from './readStudioConfig.js'

/**
 * Get the studio config for a project, given the root path.
 *
 * @param rootPath - The root path for the project
 * @returns The studio config (some properties may be missing)
 * @internal
 */
export async function getStudioConfig(
  rootPath: string,
  options: {callbackPath?: string; resolvePlugins: true},
): Promise<ResolvedStudioConfig>

export async function getStudioConfig(
  rootPath: string,
  options: {callbackPath?: string; resolvePlugins: false},
): Promise<RawStudioConfig>

export async function getStudioConfig(
  rootPath: string,
  options: ReadStudioConfigOptions,
): Promise<RawStudioConfig | ResolvedStudioConfig> {
  const studioConfigPath = await findStudioConfigPath(rootPath)
  if (!studioConfigPath) {
    throw new Error(`Unable to find studio configuration file in ${rootPath}`)
  }

  // TypeScript is not being very clever with our overloads :(
  return options.resolvePlugins
    ? readStudioConfig(studioConfigPath, {callbackPath: options.callbackPath, resolvePlugins: true})
    : readStudioConfig(studioConfigPath, {
        callbackPath: options.callbackPath,
        resolvePlugins: false,
      })
}
