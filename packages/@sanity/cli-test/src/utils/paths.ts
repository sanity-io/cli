import {posix, resolve} from 'node:path'

// Capture the initial working directory before any tests change it
const INITIAL_CWD = process.cwd()

/**
 * Gets the path to the examples directory bundled with this package.
 *
 * The examples are copied during build and bundled with the published package.
 * This function works the same whether the package is used in a monorepo
 * or installed from npm.
 *
 * @returns Absolute path to the examples directory
 * @internal
 */
export function getExamplesPath(): string {
  // From dist/utils/paths.js -> ../../examples
  return resolve(import.meta.dirname, '../../examples')
}

/**
 * Gets the path to the temporary directory for test examples.
 *
 * Uses the initial working directory captured when this module was first loaded,
 * not process.cwd() which may change during test execution.
 *
 * @param customTempDir - Optional custom temp directory path
 * @returns Absolute path to temp directory (default: initial cwd/tmp)
 * @internal
 */
export function getTempPath(customTempDir?: string): string {
  return customTempDir || resolve(INITIAL_CWD, 'tmp')
}

/**
 * Gets the current Windows drive letter from process.cwd().
 * Falls back to 'C:\\' if detection fails.
 *
 * @returns Drive letter with backslash (e.g., 'C:\\', 'D:\\') or empty string on Unix
 * @internal
 */
export function getCurrentDrive(): string {
  if (process.platform !== 'win32') {
    return ''
  }
  const cwd = process.cwd()
  const match = cwd.match(/^([A-Z]:)[\\/]/)
  return match ? match[1] + '\\' : 'C:\\'
}

/**
 * Converts Unix-style paths to platform-appropriate paths.
 * On Windows, auto-detects drive from process.cwd().
 * On Unix, keeps paths as-is.
 *
 * @param pathStr - Unix-style path (e.g., '/test/path')
 * @returns Platform-appropriate path
 * @internal
 */
export function convertToSystemPath(pathStr: string): string {
  if (process.platform === 'win32' && pathStr.startsWith('/')) {
    const drive = getCurrentDrive()
    return `${drive}${pathStr.slice(1).replaceAll('/', '\\')}`
  }
  return pathStr
}

/**
 * Joins path segments using POSIX separators (forward slashes) regardless of platform.
 * Useful for creating expected paths in tests that should work cross-platform.
 *
 * @param paths - Path segments to join
 * @returns Joined path with forward slashes
 * @internal
 */
export function posixJoin(...paths: string[]): string {
  return posix.join(...paths)
}
