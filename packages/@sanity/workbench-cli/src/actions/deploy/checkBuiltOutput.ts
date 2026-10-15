import {readFile, stat} from 'node:fs/promises'
import {join} from 'node:path'

/**
 * A genuinely-missing-build error, named so callers can offer the "run sanity
 * build" hint (the `preview` command keys off this name, matching how the studio
 * path keys off a missing `index.html`). Only the missing cases get it — real
 * I/O failures keep their own name so they surface as themselves.
 */
function buildNotFound(message: string): Error {
  const error = new Error(message)
  error.name = 'BUILD_NOT_FOUND'
  return error
}

/**
 * Throws unless `sourceDir` is a directory holding a federation build.
 * A workbench build always emits a module-federation remote, and may
 * additionally emit a standalone `index.html` SPA (workbench remotes). Either
 * way `mf-manifest.json` is the reliable marker that `sanity build` produced a
 * federation build, so that — not `index.html` — is what we check for.
 */
export async function checkBuiltOutput(sourceDir: string): Promise<void> {
  try {
    const stats = await stat(sourceDir)
    if (!stats.isDirectory()) {
      throw new Error(`"${sourceDir}" is not a directory`)
    }
  } catch (err) {
    if (err.code === 'ENOENT') throw buildNotFound(`Directory "${sourceDir}" does not exist`)
    throw err
  }

  const manifestPath = join(sourceDir, 'mf-manifest.json')
  let manifest: string
  try {
    manifest = await readFile(manifestPath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw buildNotFound(
        `"${manifestPath}" does not exist. ` +
          'The deploy directory must contain a federation build created with "sanity build".',
      )
    }
    throw err
  }

  // Every deploy sends this file to the API, so a corrupt one must fail here
  // rather than after the application is created.
  try {
    JSON.parse(manifest)
  } catch {
    throw new Error(
      `"${manifestPath}" is not valid JSON. Run "sanity build" again to regenerate it.`,
    )
  }
}
