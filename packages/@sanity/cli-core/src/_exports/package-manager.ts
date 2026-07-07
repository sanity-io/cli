export {getLocalPackageDir, getLocalPackageVersion} from '../util/getLocalPackageVersion.js'
export {
  type DetectedPackageManager,
  getBinCommand,
  getRunningPackageManager,
  getYarnMajorVersion,
} from '../util/packageManager.js'
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
