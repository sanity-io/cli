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
 * Resolves to the parsed federation manifest in `sourceDir`. A workbench build
 * may also emit a standalone `index.html`, so the manifest, not `index.html`,
 * is the marker that `sanity build` produced a federation build.
 */
export async function readBuiltManifest(sourceDir: string): Promise<Record<string, unknown>> {
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
        `"${manifestPath}" does not exist; a federation build created with "sanity build" writes it.`,
      )
    }
    throw err
  }

  // Every deploy sends this file to the API, so a corrupt one must fail here
  // rather than after the application is created.
  let parsed: unknown
  try {
    parsed = JSON.parse(manifest)
  } catch {
    throw new Error(
      `"${manifestPath}" is not valid JSON. Run "sanity build" again to regenerate it.`,
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `"${manifestPath}" is not a JSON object. Run "sanity build" again to regenerate it.`,
    )
  }
  return parsed as Record<string, unknown>
}
