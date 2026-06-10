import {readFile, stat} from 'node:fs/promises'
import {join} from 'node:path'

/** Subset of the module federation manifest that deploy validation relies on. */
interface FederationManifest {
  exposes?: {
    assets?: {
      css?: {async?: string[]; sync?: string[]}
      js?: {async?: string[]; sync?: string[]}
    }
    name?: string
  }[]
  metaData?: {
    remoteEntry?: {
      name?: string
    }
  }
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
 * Validates a module federation build: the manifest must exist and parse, the
 * remote entry it declares must be on disk, and every asset referenced by an
 * exposed module must be on disk. Catches partial or stale builds before the
 * tarball is uploaded.
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

  const remoteEntryName = manifest.metaData?.remoteEntry?.name
  if (!remoteEntryName) {
    throw new Error(
      `"${manifestPath}" does not declare a remote entry (metaData.remoteEntry.name). ` +
        'Rebuild with "sanity build".',
    )
  }

  const exposes = manifest.exposes ?? []
  if (exposes.length === 0) {
    throw new Error(
      `"${manifestPath}" declares no exposed modules, so the build contains nothing to load. ` +
        'Declare an `entry` or at least one view in the app config, then rebuild with "sanity build".',
    )
  }

  // The remote entry plus every asset an exposed module references must be on
  // disk, or the deployed remote will 404 at load time.
  const referencedFiles = new Set<string>([remoteEntryName])
  for (const expose of exposes) {
    for (const assetGroup of [expose.assets?.js, expose.assets?.css]) {
      for (const asset of [...(assetGroup?.sync ?? []), ...(assetGroup?.async ?? [])]) {
        referencedFiles.add(asset)
      }
    }
  }

  const missingFiles: string[] = []
  for (const file of referencedFiles) {
    try {
      await stat(join(sourceDir, file))
    } catch (err) {
      if (err.code === 'ENOENT') {
        missingFiles.push(file)
      } else {
        throw err
      }
    }
  }

  if (missingFiles.length > 0) {
    throw new Error(
      `"${manifestPath}" references files that are missing from the build: ` +
        `${missingFiles.join(', ')}. Rebuild with "sanity build".`,
    )
  }
}
