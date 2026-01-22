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
 * Creates a platform-appropriate mock path for testing.
 * On Windows, converts Unix-style paths to Windows paths (C:\\path\\to\\file).
 * On Unix, keeps paths as-is (/path/to/file).
 *
 * @param unixPath - Unix-style path (e.g., '/mock/project/path')
 * @returns Platform-appropriate path
 * @internal
 */
export function createMockPath(unixPath: string, {windowsPrefix = 'C:\\'} = {}): string {
  if (process.platform === 'win32') {
    // Convert Unix path to Windows path
    // /mock/project/path' => C:\mock\project\path
    return `${windowsPrefix}${unixPath.replaceAll('/', '\\')}`
  }
  return unixPath
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
