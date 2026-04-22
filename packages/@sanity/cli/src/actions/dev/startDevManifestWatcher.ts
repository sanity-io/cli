import {watch} from 'node:fs'
import {basename, dirname, join, resolve} from 'node:path'

import {findProjectRoot, type Output} from '@sanity/cli-core'

import {extractManifest} from '../manifest/extractManifest.js'
import {devDebug} from './devDebug.js'
import {type DevServerManifest} from './devServerRegistry.js'

/**
 * Dev-time manifest output directory, relative to the studio working directory.
 * Mirrors the `node_modules/.sanity/vite` convention so it stays out of `dist`
 * and is ignored by default in typical `.gitignore` files.
 */
const MANIFEST_DIR = 'node_modules/.sanity/manifest'
const MANIFEST_FILENAME = 'create-manifest.json'

/**
 * Debounce window between `sanity.config.ts` file-system events and the next
 * manifest regeneration. Coalesces rapid saves (e.g. editor auto-save) and
 * atomic-rename bursts emitted by tools like VS Code.
 */
const DEBOUNCE_MS = 250

interface DevManifestWatcher {
  close: () => Promise<void>
}

type RegistryPatch = Partial<Omit<DevServerManifest, 'pid' | 'startedAt' | 'version'>>

interface StartDevManifestWatcherOptions {
  output: Output
  /** Called after every successful regeneration to touch the registry entry. */
  update: (patch: RegistryPatch) => void
  workDir: string
}

/**
 * Generate the studio manifest once and then keep it in sync with the
 * `sanity.config.(ts|js)` file on disk. Each successful regeneration writes
 * the manifest files into `<workDir>/node_modules/.sanity/manifest/` and
 * invokes `update({manifestPath, manifestUpdatedAt})` so callers can touch
 * their registry entry and trigger a workbench rebroadcast.
 *
 * Errors during extraction are logged as warnings and do not crash the dev
 * server — the previous manifest on disk (if any) stays in place.
 */
export async function startDevManifestWatcher({
  output,
  update,
  workDir,
}: StartDevManifestWatcherOptions): Promise<DevManifestWatcher> {
  const projectRoot = await findProjectRoot(workDir)
  const configPath = projectRoot.path
  const outPath = resolve(workDir, MANIFEST_DIR)
  const manifestPath = join(outPath, MANIFEST_FILENAME)

  let running = false
  let pending = false
  let closed = false

  const regenerate = async () => {
    if (closed) return
    if (running) {
      pending = true
      return
    }
    running = true
    try {
      await extractManifest({
        outPath,
        path: configPath,
        workDir,
      })
      if (closed) return
      update({manifestPath, manifestUpdatedAt: new Date().toISOString()})
    } catch (err) {
      // extractManifest prints its own spinner failure; log the reason here so
      // the user sees what went wrong alongside the spinner indicator.
      devDebug('Manifest regeneration failed: %O', err)
      output.warn(
        `Could not extract studio manifest for workbench: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      running = false
      if (pending && !closed) {
        pending = false
        void regenerate()
      }
    }
  }

  // Initial generation — awaited so the first registry touch happens before
  // we hand control back to the caller. A failure here is warned about but
  // does not prevent the dev server from coming up.
  await regenerate()

  // Watch the config file's parent directory and filter by filename.
  // Watching the file itself is unreliable across editors that perform
  // atomic-save (delete + rename) — the watcher loses its target once the
  // inode changes. Directory watches survive those transitions.
  const configDir = dirname(configPath)
  const configFilename = basename(configPath)

  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const onEvent = (_event: string, filename: Buffer | string | null) => {
    if (!filename) return
    const name = typeof filename === 'string' ? filename : filename.toString('utf8')
    if (name !== configFilename) return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void regenerate()
    }, DEBOUNCE_MS)
  }

  const watcher = watch(configDir, onEvent)

  watcher.on('error', (err) => {
    devDebug('Config watcher error: %O', err)
    output.warn(
      `Studio manifest watcher error: ${err instanceof Error ? err.message : String(err)}`,
    )
  })

  return {
    close: async () => {
      closed = true
      clearTimeout(debounceTimer)
      watcher.close()
    },
  }
}
