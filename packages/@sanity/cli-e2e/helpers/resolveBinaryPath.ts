import {existsSync} from 'node:fs'

/**
 * Returns the absolute path to the `sanity` CLI binary.
 *
 * The path is read from the `E2E_BINARY_PATH` environment variable, which is
 * set by `globalSetup` (via npm pack) or by the CI workflow (npm registry mode).
 */
export function resolveBinaryPath(): string {
  const binaryPath = process.env.E2E_BINARY_PATH
  if (!binaryPath) {
    throw new Error(
      'E2E_BINARY_PATH is not set. ' +
        'This should be set by globalSetup (via npm pack) or by the CI workflow (npm registry mode).',
    )
  }
  if (!existsSync(binaryPath)) {
    throw new Error(`CLI binary not found at ${binaryPath}`)
  }
  return binaryPath
}
