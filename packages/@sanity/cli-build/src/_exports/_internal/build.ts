export {type AutoUpdatesBuildConfig} from '../../actions/build/autoUpdates.js'
export {buildDebug} from '../../actions/build/buildDebug.js'
export {checkRequiredDependencies} from '../../actions/build/checkRequiredDependencies.js'
export {checkStudioDependencyVersions} from '../../actions/build/checkStudioDependencyVersions.js'
export {
  getAutoUpdatesCssUrls,
  getAutoUpdatesImportMap,
  getModuleUrl,
} from '../../actions/build/getAutoUpdatesImportMap.js'
export {
  getAppEnvironmentVariables,
  getStudioEnvironmentVariables,
  type StudioEnvVariablesOptions,
} from '../../actions/build/getEnvironmentVariables.js'
export {
  extendViteConfigWithUserConfig,
  finalizeViteConfig,
  getViteConfig,
} from '../../actions/build/getViteConfig.js'
export {
  resolveVendorBuildConfig,
  type VendorBuildConfig,
} from '../../actions/build/resolveVendorBuildConfig.js'
export {writeFavicons} from '../../actions/build/writeFavicons.js'
export {resolveEntries, writeSanityRuntime} from '../../actions/build/writeSanityRuntime.js'
export {SANITY_CACHE_DIR} from '../../constants.js'
export {AppBuildTrace, StudioBuildTrace} from '../../telemetry/build.telemetry.js'
export {copyDir} from '../../util/copyDir.js'
