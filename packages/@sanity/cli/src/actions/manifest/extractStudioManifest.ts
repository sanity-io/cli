import {readFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {type StudioManifest} from '@sanity/cli-build/_internal/manifest'
import {SANITY_CACHE_DIR} from '@sanity/cli-core/config'

import {loadCliBuild} from '../../util/loadCliBuild.js'
import {extractManifest} from './extractManifest.js'

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
  applicationId?: string
  configPath: string
  silent?: boolean

  workDir: string
}): Promise<StudioManifest | undefined> {
  const {MANIFEST_FILENAME} = await loadCliBuild('manifest')
  const outPath = resolve(options.workDir, MANIFEST_DIR)
  await extractManifest({
    applicationId: options.applicationId,
    outPath,
    path: options.configPath,
    silent: options.silent,
    workDir: options.workDir,
  })
  const raw = await readFile(join(outPath, MANIFEST_FILENAME), 'utf8')
  return JSON.parse(raw)
}
