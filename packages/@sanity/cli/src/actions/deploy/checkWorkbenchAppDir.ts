import {readFile, stat} from 'node:fs/promises'
import {join} from 'node:path'

/** Subset of the module federation manifest that deploy validation relies on. */
interface FederationManifest {
  exposes?: unknown[]
}

/**
 * Checks that the directory exists, is a directory and contains a federation
 * build. Workbench (`unstable_defineApp`) builds emit a module federation
 * remote instead of a static SPA, so `checkDir`'s `index.html` contract does
 * not apply to them.
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

  await checkFederationBuild(sourceDir)
}

/**
 * Validates a module federation build: the manifest must exist and expose at
 * least one module — a federated app with no exposes contains nothing to load.
 */
async function checkFederationBuild(sourceDir: string): Promise<void> {
  const manifestPath = join(sourceDir, 'mf-manifest.json')

  let rawManifest: string
  try {
    rawManifest = await readFile(manifestPath, 'utf8')
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

  let manifest: FederationManifest
  try {
    manifest = JSON.parse(rawManifest)
  } catch {
    throw new Error(`"${manifestPath}" is not valid JSON. Rebuild with "sanity build".`)
  }

  const exposes = manifest.exposes ?? []
  if (exposes.length === 0) {
    throw new Error(
      `"${manifestPath}" declares no exposed modules, so the build contains nothing to load. ` +
        'Declare an `entry` or at least one view in the app config, then rebuild with "sanity build".',
    )
  }
}
