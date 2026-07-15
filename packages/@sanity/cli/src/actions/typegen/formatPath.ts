/** Formats a path so it is the same in Windows and Unix. */
export function formatPath(path: string): string {
  return path.replaceAll('\\', '/')
}
