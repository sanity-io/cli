import {readFile, stat} from 'node:fs/promises'
import {join} from 'node:path'

/** Subset of the module federation manifest that deploy validation relies on. */
interface FederationManifest {
  exposes?: unknown[]
}

interface CheckDirOptions {
  /**
   * Workbench (`unstable_defineApp`) builds emit a module federation remote
   * instead of a static SPA — validate that shape rather than `index.html`.
   */
  isWorkbenchApp?: boolean
}

/**
 * Checks that the directory exists, is a directory and seems to have valid content
 *
 * @internal
 * @param sourceDir - The directory to check
 * @param options - Options controlling which build shape to validate
 * @returns void
 */
export async function checkDir(sourceDir: string, options: CheckDirOptions = {}): Promise<void> {
  try {
    const stats = await stat(sourceDir)
    if (!stats.isDirectory()) {
      throw new Error(`Directory ${sourceDir} is not a directory`)
    }
  } catch (err) {
    const error = err.code === 'ENOENT' ? new Error(`Directory "${sourceDir}" does not exist`) : err

    throw error
  }

  if (options.isWorkbenchApp) {
    await checkFederationBuild(sourceDir)
    return
  }

  try {
    await stat(join(sourceDir, 'index.html'))
  } catch (err) {
    const error =
      err.code === 'ENOENT'
        ? new Error(
            [
              `"${sourceDir}/index.html" does not exist -`,
              '[SOURCE_DIR] must be a directory containing',
              'a Sanity studio built using "sanity build"',
            ].join(' '),
          )
        : err

    throw error
  }
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
