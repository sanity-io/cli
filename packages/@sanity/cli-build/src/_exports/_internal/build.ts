export {type AutoUpdatesBuildConfig} from '../../actions/build/autoUpdates.js'
export {buildDebug} from '../../actions/build/buildDebug.js'
export {checkStudioDependencyVersions} from '../../actions/build/checkStudioDependencyVersions.js'
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
export {AppBuildTrace, StudioBuildTrace} from '../../telemetry/build.telemetry.js'
export {copyDir} from '../../util/copyDir.js'
