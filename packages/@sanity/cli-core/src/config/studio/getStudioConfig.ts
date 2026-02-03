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
 * @public
 */
export async function getStudioConfig(
  rootPath: string,
  options: {resolvePlugins: true},
): Promise<ResolvedStudioConfig>

export async function getStudioConfig(
  rootPath: string,
  options: {resolvePlugins: false},
): Promise<RawStudioConfig>

export async function getStudioConfig(
  rootPath: string,
  options: ReadStudioConfigOptions,
): Promise<RawStudioConfig | ResolvedStudioConfig> {
  const studioConfigPath = await findStudioConfigPath(rootPath)

  // TypeScript is not being very clever with our overloads :(
  return options.resolvePlugins
    ? readStudioConfig(studioConfigPath, {resolvePlugins: true})
    : readStudioConfig(studioConfigPath, {resolvePlugins: false})
}
