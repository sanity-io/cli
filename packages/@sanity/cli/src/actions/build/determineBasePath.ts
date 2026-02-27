import {type CliConfig, type Output} from '@sanity/cli-core'

/**
 * Finds the basepath given conditions
 *
 * @internal
 */
export function determineBasePath(
  cliConfig: CliConfig,
  type: 'app' | 'studio',
  output?: Output,
): string {
  // Determine base path for built studio
  let basePath = '/'
  const envBasePath =
    type === 'app' ? process.env.SANITY_APP_BASEPATH : process.env.SANITY_STUDIO_BASEPATH
  const configBasePath = cliConfig?.project?.basePath

  if (envBasePath) {
    // Environment variable (SANITY_APP_BASEPATH or SANITY_STUDIO_BASEPATH)
    basePath = envBasePath
  } else if (configBasePath) {
    // `sanity.cli.ts`
    basePath = configBasePath
  }

  if (envBasePath && configBasePath && output) {
    output.warn(
      `Overriding configured base path (${configBasePath}) with value from environment variable (${envBasePath})`,
    )
  }

  return basePath
}
