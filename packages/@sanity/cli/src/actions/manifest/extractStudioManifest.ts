import {readFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {SANITY_CACHE_DIR} from '@sanity/cli-build/_internal/util'

import {extractManifest} from './extractManifest.js'
import {type StudioManifest} from './types.js'
import {MANIFEST_FILENAME} from './writeManifestFile.js'

/**
 * Dev-time manifest output directory, relative to the studio working
 * directory. Sibling of Vite's `cacheDir` so it stays out of `dist` and is
 * ignored by default in typical `.gitignore` files.
 */
const MANIFEST_DIR = `${SANITY_CACHE_DIR}/manifest`

/**
 * Run the worker-based studio schema extraction, write the resulting manifest
 * to `MANIFEST_DIR`, then read it back so the caller can inline it into the
 * registry.
 *
 * `configPath` must be the resolved `sanity.config.(ts|js)` path — passing it
 * in (e.g. from `findProjectRoot`) avoids re-traversing the filesystem on
 * every call.
 */
export async function extractStudioManifest(options: {
  configPath: string
  workDir: string
}): Promise<StudioManifest | undefined> {
  const outPath = resolve(options.workDir, MANIFEST_DIR)
  await extractManifest({outPath, path: options.configPath, workDir: options.workDir})
  const raw = await readFile(join(outPath, MANIFEST_FILENAME), 'utf8')
  return JSON.parse(raw)
}
