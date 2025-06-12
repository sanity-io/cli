import {findPathForFiles} from './findConfigsPaths.js'

/**
 * Resolves to a string containing the found config path, or `undefined` if not found.
 *
 * @param basePath - The base path to start searching from
 * @returns A promise that resolves to a string containing the found config path, or `undefined` if not found
 * @internal
 */
export async function findAppConfigPath(basePath: string): Promise<string | undefined> {
  const paths = await findPathForFiles(basePath, ['sanity.cli.ts', 'sanity.cli.js'])
  const configPaths = paths.filter((path) => path.exists)
  if (configPaths.length > 1) {
    throw new Error(
      `Multiple app config files found (${configPaths.map((path) => path.path).join(', ')})`,
    )
  }

  if (configPaths.length === 1) {
    return configPaths[0].path
  }
}
