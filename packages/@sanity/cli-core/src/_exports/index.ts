// DO NOT ADD NEW EXPORTS TO THIS FILE!
// These are left here for backwards compatibility.
// If you came here looking to add new exports, instead take a look through the `exports` in package.json and think about which of those groups your new export belongs to. You may want to consider adding a _new_ export if there is no clean conceptual fit.
// This is all in the name of minimizing 'barrel' export files and keeping `import`s fast. See the following for context: https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/
export {
  getGlobalCliClient,
  getProjectCliClient,
  type GlobalCliClientOptions,
  type ProjectCliClientOptions,
} from '../apiClient.js'
export {
  clearCliTokenCache,
  getCliToken,
  getCliUserConfig,
  getUserConfig,
  setCliUserConfig,
} from '../config/cli/cliUserConfig.js'
export {getCliConfig, getCliConfigUncached} from '../config/cli/getCliConfig.js'
export {getCliConfigSync} from '../config/cli/getCliConfigSync.js'
export {type CliConfig, type ConfigStore} from '../config/cli/types/cliConfig.js'
export {type UserViteConfig} from '../config/cli/types/userViteConfig.js'
export {type ApplicationType, isWorkbenchApp} from '../config/cli/workbenchApp.js'
export {findProjectRoot} from '../config/findProjectRoot.js'
export {findProjectRootSync} from '../config/findProjectRootSync.js'
export {getStudioConfig} from '../config/studio/getStudioConfig.js'
export {getStudioWorkspaces} from '../config/studio/getStudioWorkspaces.js'
export {isStudioConfig} from '../config/studio/isStudioConfig.js'
export {findPathForFiles} from '../config/util/findConfigsPaths.js'
export {findStudioConfigPath, tryFindStudioConfigPath} from '../config/util/findStudioConfigPath.js'
export {type ProjectRootResult} from '../config/util/recursivelyResolveProjectRoot.js'
export {NonInteractiveError} from '../errors/NonInteractiveError.js'
export {isNotFoundError, NotFoundError} from '../errors/NotFoundError.js'
export {
  isProjectRootNotFoundError,
  ProjectRootNotFoundError,
} from '../errors/ProjectRootNotFoundError.js'
export {exitCodes} from '../exitCodes.js'
export {createStudioWorker, studioWorkerTask} from '../loaders/studio/studioWorkerTask.js'
export {tsxWorkerTask} from '../loaders/tsx/tsxWorkerTask.js'
export {SanityCommand, type SanityCommandInterface} from '../SanityCommand.js'
export {
  clearCliTelemetry,
  CLI_TELEMETRY_SYMBOL,
  getCliTelemetry,
  reportCliTraceError,
  setCliTelemetry,
} from '../telemetry/getCliTelemetry.js'
export {getTelemetryBaseInfo} from '../telemetry/getTelemetryBaseInfo.js'
export {noopLogger} from '../telemetry/noopTelemetry.js'
export {
  type CLITelemetryStore,
  type ConsentInformation,
  type TelemetryUserProperties,
} from '../telemetry/types.js'
export {type Output, type RequireProps, type SanityOrgUser} from '../types.js'
export {doImport} from '../util/doImport.js'
export {mockBrowserEnvironment} from '../util/environment/mockBrowserEnvironment.js'
export {getErrorMessage, toError} from '../util/getErrorMessage.js'
export {getLocalPackageDir, getLocalPackageVersion} from '../util/getLocalPackageVersion.js'
export {getSanityConfigDir, getSanityDataDir} from '../util/getSanityConfigDir.js'
export {getSanityEnvVar} from '../util/getSanityEnvVar.js'
export {getSanityUrl} from '../util/getSanityUrl.js'
export {getWorkspace} from '../util/getWorkspace.js'
export {importModule} from '../util/importModule.js'
export {isCi} from '../util/isCi.js'
export {isInteractive} from '../util/isInteractive.js'
export {isStaging} from '../util/isStaging.js'
export {normalizePath} from '../util/normalizePath.js'
export {promisifyWorker} from '../util/promisifyWorker.js'
export {
  type PackageJson,
  readPackageJson,
  type ReadPackageJsonOptions,
} from '../util/readPackageJson.js'
export {
  resolveLocalPackage,
  resolveLocalPackageFrom,
  resolveLocalPackagePath,
} from '../util/resolveLocalPackage.js'
export {safeStructuredClone} from '../util/safeStructuredClone.js'
export {colorizeJson} from '../ux/colorizeJson.js'
export {getTimer} from '../ux/timer.js'
export {debug, subdebug} from './debug.js'
export {
  type CoreAppManifest,
  coreAppManifestSchema,
  type StudioManifest,
  studioManifestSchema,
} from './schemas.js'
