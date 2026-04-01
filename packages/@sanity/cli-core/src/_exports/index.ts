import {deprecate} from 'node:util'

import {NonInteractiveError as _NonInteractiveError} from '../errors/NonInteractiveError.js'
import {NotFoundError as _NotFoundError} from '../errors/NotFoundError.js'
import {ProjectRootNotFoundError as _ProjectRootNotFoundError} from '../errors/ProjectRootNotFoundError.js'

export * from '../config/cli/getCliConfig.js'
export * from '../config/cli/getCliConfigSync.js'
export {type CliConfig} from '../config/cli/types/cliConfig.js'
export {type UserViteConfig} from '../config/cli/types/userViteConfig.js'
export * from '../config/findProjectRoot.js'
export * from '../config/findProjectRootSync.js'
export * from '../config/studio/getStudioConfig.js'
export * from '../config/studio/getStudioWorkspaces.js'
export * from '../config/studio/isStudioConfig.js'
export * from '../config/util/findConfigsPaths.js'
export * from '../config/util/findStudioConfigPath.js'
export {type ProjectRootResult} from '../config/util/recursivelyResolveProjectRoot.js'
export * from '../debug.js'
export * from '../exitCodes.js'
export * from '../loaders/studio/studioWorkerTask.js'
export * from '../loaders/tsx/tsxWorkerTask.js'
export * from '../SanityCommand.js'
export * from '../services/apiClient.js'
export * from '../services/cliUserConfig.js'
export * from '../services/getCliToken.js'
export {
  clearCliTelemetry,
  CLI_TELEMETRY_SYMBOL,
  getCliTelemetry,
  setCliTelemetry,
} from '../telemetry/getCliTelemetry.js'
export {getTelemetryBaseInfo} from '../telemetry/getTelemetryBaseInfo.js'
export {
  type CLITelemetryStore,
  type ConsentInformation,
  type TelemetryUserProperties,
} from '../telemetry/types.js'
export {type Output, type SanityOrgUser} from '../types.js'
export {doImport} from '../util/doImport.js'
export * from '../util/environment/mockBrowserEnvironment.js'
export * from '../util/getSanityEnvVar.js'
export * from '../util/getSanityUrl.js'
export * from '../util/importModule.js'
export * from '../util/isCi.js'
export * from '../util/isInteractive.js'
export * from '../util/isStaging.js'
export * from '../util/normalizePath.js'
export * from '../util/promisifyWorker.js'
export * from '../util/readPackageJson.js'
export * from '../util/resolveLocalPackage.js'
export * from '../util/safeStructuredClone.js'
export * from '../ux/colorizeJson.js'
export * from '../ux/timer.js'

export const NonInteractiveError = deprecate(
  _NonInteractiveError,
  'Import `NonInteractiveError` from `@sanity/cli-core/errors`',
)
export const NotFoundError = deprecate(
  _NotFoundError,
  'Import `NotFoundError` from `@sanity/cli-core/errors`',
)
export const ProjectRootNotFoundError = deprecate(
  _ProjectRootNotFoundError,
  'Import `ProjectRootNotFoundError` from `@sanity/cli-core/errors`',
)
