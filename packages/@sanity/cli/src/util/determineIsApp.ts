import {type CliConfig} from '../config/cli/types.js'

/**
 * Determine if the current project is an app.
 *
 * @returns `true` if the current project is an app, `false` otherwise.
 */
export function determineIsApp(cliConfig: CliConfig): boolean {
  return Boolean(cliConfig && 'app' in cliConfig)
}
