/**
 * Normalizes a path for cross-platform comparison by converting backslashes to forward slashes.
 * Useful for converting windows paths to unix paths.
 *
 * @param path - Path to normalize
 * @returns Normalized path with forward slashes
 * @public
 */
export function normalizePath(path: string): string {
  return path.replaceAll('\\', '/')
}
