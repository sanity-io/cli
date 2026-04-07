import {mkdir, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

// Capture the initial working directory before any tests change it
const INITIAL_CWD = process.cwd()

/**
 * Gets the path to the fixtures directory bundled with this package.
 *
 * The fixtures are copied during build and bundled with the published package.
 * This function works the same whether the package is used in a monorepo
 * or installed from npm.
 *
 * @returns Absolute path to the fixtures directory
 * @internal
 */
export function getFixturesPath(): string {
  // From dist/utils/paths.js -> ../../fixtures
  return resolve(import.meta.dirname, '../../fixtures')
}

/**
 * Gets the path to the temporary directory for test fixtures.
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
 * Creates a unique temporary directory for test output.
 * Uses {@link getTempPath} as the base, creating it if needed.
 *
 * @param options - Configuration options: `prefix` (default: 'cli-e2e-') and
 *   `useSystemTmp` (default: false) which uses the OS temp directory instead of
 *   cwd/tmp to avoid monorepo workspace detection by package managers and git.
 * @returns The path and a cleanup function
 * @public
 */
export async function createTmpDir(
  options: {prefix?: string; useSystemTmp?: boolean} = {},
): Promise<{cleanup: () => Promise<void>; path: string}> {
  const {prefix = 'cli-e2e-', useSystemTmp = false} = options
  const basePath = useSystemTmp ? join(tmpdir(), 'sanity-cli-e2e') : getTempPath()
  await mkdir(basePath, {recursive: true})
  const path = await mkdtemp(join(basePath, prefix))
  return {
    cleanup: () => rm(path, {force: true, recursive: true}),
    path,
  }
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
