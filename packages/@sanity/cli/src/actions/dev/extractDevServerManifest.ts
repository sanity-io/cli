import {readFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {findProjectRoot} from '@sanity/cli-core'

import {extractManifest} from '../manifest/extractManifest.js'
import {type StudioManifest} from '../manifest/types.js'
import {MANIFEST_FILENAME} from '../manifest/writeManifestFile.js'

/**
 * Dev-time manifest output directory, relative to the studio working
 * directory. Mirrors the `node_modules/.sanity/vite` convention so it
 * stays out of `dist` and is ignored by default in typical `.gitignore`
 * files.
 */
const MANIFEST_DIR = 'node_modules/.sanity/manifest'

/**
 * Run the heavy worker-based studio schema extraction, write the
 * resulting `create-manifest.json` to `node_modules/.sanity/manifest/`,
 * then read it back so the caller can inline it into the registry.
 */
export async function extractStudioManifest(options: {
  workDir: string
}): Promise<StudioManifest | undefined> {
  const projectRoot = await findProjectRoot(options.workDir)
  const outPath = resolve(options.workDir, MANIFEST_DIR)
  await extractManifest({outPath, path: projectRoot.path, workDir: options.workDir})
  const raw = await readFile(join(outPath, MANIFEST_FILENAME), 'utf8')
  return JSON.parse(raw)
}
