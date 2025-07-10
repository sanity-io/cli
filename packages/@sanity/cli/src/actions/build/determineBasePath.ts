import {type CliConfig} from '../../config/cli/types.js'

/**
 * Finds the basepath given conditions
 *
 * @internal
 */
export function determineBasePath(cliConfig: CliConfig, type: 'app' | 'studio'): string {
  // Determine base path for built studio
  let basePath = '/'
  const envBasePath =
    type === 'app' ? process.env.SANITY_APP_BASEPATH : process.env.SANITY_STUDIO_BASEPATH
  const configBasePath = cliConfig?.project?.basePath

  if (envBasePath) {
    // Environment variable (SANITY_APP_BASEPATH)
    basePath = envBasePath
  } else if (configBasePath) {
    // `sanity.cli.ts`
    basePath = configBasePath
  }

  return basePath
}
