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
