/**
 * Converts path separators to forward slashes for ESM imports.
 * @internal
 */
export function toForwardSlashes(filePath: string): string {
  return filePath.replaceAll('\\', '/')
}
