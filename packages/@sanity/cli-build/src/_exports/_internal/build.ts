export {buildApp} from '../../actions/build/buildApp.js'
export {buildStaticFiles} from '../../actions/build/buildStaticFiles.js'
export {buildStudio} from '../../actions/build/buildStudio.js'
export {checkRequiredDependencies} from '../../actions/build/checkRequiredDependencies.js'
export {checkStudioDependencyVersions} from '../../actions/build/checkStudioDependencyVersions.js'
export {extendViteConfigWithUserConfig, getViteConfig} from '../../actions/build/getViteConfig.js'
export {resolveVendorBuildConfig} from '../../actions/build/resolveVendorBuildConfig.js'
export {writeSanityRuntime} from '../../actions/build/writeSanityRuntime.js'
export {SANITY_CACHE_DIR} from '../../constants.js'
export {
  compareDependencyVersions,
  type CompareDependencyVersions,
  type CompareDependencyVersionsResult,
  type UnresolvedPrerelease,
} from '../../util/compareDependencyVersions.js'
