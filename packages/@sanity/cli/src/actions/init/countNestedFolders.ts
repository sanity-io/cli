export function countNestedFolders(path: string): number {
  const separator = path.includes('\\') ? '\\' : '/'
  return path.split(separator).filter(Boolean).length
}
