import {isAbsolute, relative} from 'node:path'

import picomatch from 'picomatch'

import {toForwardSlashes} from '../../util/toForwardSlashes.js'

/**
 * Creates a pattern matcher function for schema watch patterns.
 * Normalizes file paths to forward slashes and makes them relative before matching.
 *
 * @param patterns - Array of glob patterns to match against
 * @returns Function that takes a file path and workDir, returns true if file matches any pattern
 * @internal
 */
export function createSchemaPatternMatcher(patterns: string[]): {
  isMatch: (filePath: string, workDir: string) => boolean
} {
  const matcher = picomatch(patterns)

  return {
    isMatch: (filePath: string, workDir: string): boolean => {
      const relativePath = isAbsolute(filePath) ? relative(workDir, filePath) : filePath
      const normalizedPath = toForwardSlashes(relativePath)
      return matcher(normalizedPath)
    },
  }
}
