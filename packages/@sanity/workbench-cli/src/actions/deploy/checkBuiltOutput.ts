import {stat} from 'node:fs/promises'
import {join} from 'node:path'

/**
 * Throws unless `sourceDir` is a directory holding a federation build.
 * Workbench builds emit a module-federation remote instead of a static SPA,
 * so the usual `index.html` contract doesn't apply — `mf-manifest.json` is the
 * marker that `sanity build` produced a federation build.
 */
export async function checkBuiltOutput(sourceDir: string): Promise<void> {
  try {
    const stats = await stat(sourceDir)
    if (!stats.isDirectory()) {
      throw new Error(`"${sourceDir}" is not a directory`)
    }
  } catch (err) {
    throw err.code === 'ENOENT' ? new Error(`Directory "${sourceDir}" does not exist`) : err
  }

  const manifestPath = join(sourceDir, 'mf-manifest.json')
  try {
    await stat(manifestPath)
  } catch (err) {
    throw err.code === 'ENOENT'
      ? new Error(
          `"${manifestPath}" does not exist. ` +
            'The deploy directory must contain a federation build created with "sanity build".',
        )
      : err
  }
}
