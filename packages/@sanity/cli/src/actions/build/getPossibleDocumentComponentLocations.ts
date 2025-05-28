import path from 'node:path'

/**
 * @internal
 */
export function getPossibleDocumentComponentLocations(rootPath: string): string[] {
  return [path.join(rootPath, '_document.js'), path.join(rootPath, '_document.tsx')]
}
