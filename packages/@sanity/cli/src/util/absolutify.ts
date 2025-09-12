import os from 'node:os'
import path from 'node:path'

/**
 * Converts a relative path to an absolute path, handling home directory expansion
 * @param dir - The directory path to make absolute
 * @returns The absolute path
 */
export function absolutify(dir: string): string {
  const pathName = expandHome(dir)
  return path.isAbsolute(pathName) ? pathName : path.resolve(process.cwd(), pathName)
}

/**
 * Expands home directory shortcuts in file paths
 * @param filePath - The file path to expand
 * @returns The expanded file path
 */
function expandHome(filePath: string): string {
  if (filePath.codePointAt(0) === 126 /* ~ */) {
    if (filePath.codePointAt(1) === 43 /* + */) {
      return path.join(process.cwd(), filePath.slice(2))
    }

    const home = os.homedir()
    return home ? path.join(home, filePath.slice(1)) : filePath
  }

  return filePath
}
