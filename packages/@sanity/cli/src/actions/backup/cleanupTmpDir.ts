import {rm} from 'node:fs/promises'

import {backupDownloadDebug} from './backupDownloadDebug.js'

/**
 * Removes the temporary directory and all its contents
 *
 * @param tmpDir - Path to the temporary directory to clean up
 */
export async function cleanupTmpDir(tmpDir: string): Promise<void> {
  try {
    await rm(tmpDir, {force: true, recursive: true})
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    backupDownloadDebug(`Error cleaning up temporary files: ${message}`)
  }
}
