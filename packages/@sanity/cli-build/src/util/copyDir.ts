import {constants as fsConstants} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Tries to read a directory, and returns an empty array if the directory does not exist
 *
 * @internal
 *
 * @param dir - Directory to read
 * @returns List of files in the directory
 */
async function tryReadDir(dir: string): Promise<string[]> {
  try {
    const content = await fs.readdir(dir)
    return content
  } catch (err) {
    if (err.code === 'ENOENT') {
      return []
    }

    throw err
  }
}

/**
 * Skips an error if the file already exists
 *
 * @internal
 *
 * @param err - Error to check
 */
export function skipIfExistsError(err: Error & {code: string}) {
  if (err.code === 'EEXIST') {
    return
  }

  throw err
}

/**
 * Copies a directory from one location to another
 *
 * @internal
 *
 * @param srcDir - Source directory
 * @param destDir - Destination directory
 * @param skipExisting - Skip existing files
 */
export async function copyDir(
  srcDir: string,
  destDir: string,
  skipExisting?: boolean,
): Promise<void> {
  await fs.mkdir(destDir, {recursive: true})

  for (const file of await tryReadDir(srcDir)) {
    const srcFile = path.resolve(srcDir, file)
    if (srcFile === destDir) {
      continue
    }

    const destFile = path.resolve(destDir, file)
    const stat = await fs.stat(srcFile)

    if (stat.isDirectory()) {
      await copyDir(srcFile, destFile, skipExisting)
    } else if (skipExisting) {
      await fs.copyFile(srcFile, destFile, fsConstants.COPYFILE_EXCL).catch(skipIfExistsError)
    } else {
      await fs.copyFile(srcFile, destFile)
    }
  }
}
