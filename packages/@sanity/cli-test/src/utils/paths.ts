import {resolve} from 'node:path'

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
 * On Windows:
 *   - Absolute paths starting with '/': adds drive letter and converts to backslashes
 *   - Relative/partial paths: converts forward slashes to backslashes
 * On Unix: keeps paths as-is.
 *
 * @param pathStr - Unix-style path (e.g., '/test/path' or '.config/file.json')
 * @returns Platform-appropriate path
 * @internal
 */
export function convertToSystemPath(pathStr: string): string {
  if (process.platform === 'win32') {
    if (pathStr.startsWith('/')) {
      // Absolute Unix path - add drive letter
      const drive = getCurrentDrive()
      return `${drive}${pathStr.slice(1).replaceAll('/', '\\')}`
    }
    // Relative/partial path - just convert separators
    return pathStr.replaceAll('/', '\\')
  }
  return pathStr
}
