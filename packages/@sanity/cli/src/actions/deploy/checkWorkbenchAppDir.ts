import {stat} from 'node:fs/promises'
import {join} from 'node:path'

/**
 * Checks that the directory exists, is a directory and contains a federation
 * build. Workbench (`unstable_defineApp`) builds emit a module federation
 * remote instead of a static SPA, so `checkDir`'s `index.html` contract does
 * not apply to them. `mf-manifest.json` presence is the marker that "sanity
 * build" produced a federation build — whether the app declares anything to
 * expose is settled against the config before the build runs.
 *
 * @internal
 * @param sourceDir - The directory to check
 * @returns void
 */
export async function checkWorkbenchAppDir(sourceDir: string): Promise<void> {
  try {
    const stats = await stat(sourceDir)
    if (!stats.isDirectory()) {
      throw new Error(`Directory ${sourceDir} is not a directory`)
    }
  } catch (err) {
    const error = err.code === 'ENOENT' ? new Error(`Directory "${sourceDir}" does not exist`) : err

    throw error
  }

  const manifestPath = join(sourceDir, 'mf-manifest.json')
  try {
    await stat(manifestPath)
  } catch (err) {
    const error =
      err.code === 'ENOENT'
        ? new Error(
            `"${manifestPath}" does not exist. ` +
              'The deploy directory must contain a federation build created with "sanity build".',
          )
        : err

    throw error
  }
}
