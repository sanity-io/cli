import {watch} from 'node:fs'
import {basename, dirname} from 'node:path'

import {findProjectRoot, type Output} from '@sanity/cli-core'

import {type StudioManifest} from '../manifest/types.js'
import {devDebug} from './devDebug.js'
import {extractStudioManifest} from './extractDevServerManifest.js'

/**
 * Debounce window between config file events and the next manifest
 * regeneration. Coalesces rapid saves (e.g. editor auto-save) and
 * atomic-rename bursts emitted by tools like VS Code.
 */
const DEBOUNCE_MS = 250

interface DevManifestWatcher {
  close: () => Promise<void>
}

/** Subset of registry fields the watcher is allowed to update. */
interface ManifestPatch {
  manifest: StudioManifest | undefined
  manifestUpdatedAt: string
}

interface StartDevManifestWatcherOptions {
  output: Output
  /** Called after every successful extraction with the inlined manifest. */
  update: (patch: ManifestPatch) => void
  workDir: string
}

/**
 * Keep the studio manifest in sync with the `sanity.config.(ts|js)` file on
 * disk. The initial extraction happens in `devAction` so the registry entry
 * already carries a manifest when the watcher starts — this watcher only
 * re-extracts on subsequent file-system events. Each successful regeneration
 * inlines the new manifest into the registry via the `update` callback, so
 * any running workbench rebroadcasts to its clients.
 *
 * Errors during extraction are logged as warnings and do not crash the dev
 * server — the previously extracted manifest stays in the registry.
 */
export async function startDevManifestWatcher({
  output,
  update,
  workDir,
}: StartDevManifestWatcherOptions): Promise<DevManifestWatcher> {
  const projectRoot = await findProjectRoot(workDir)
  const configPath = projectRoot.path

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
      const manifest = await extractStudioManifest({workDir})
      if (closed) return
      update({manifest, manifestUpdatedAt: new Date().toISOString()})
    } catch (err) {
      // Extractors print their own spinner failure; log the reason here so
      // the user sees what went wrong alongside the spinner indicator.
      devDebug('Manifest regeneration failed: %O', err)
      output.warn(
        `Could not extract manifest for workbench: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      running = false
      if (pending && !closed) {
        pending = false
        void regenerate()
      }
    }
  }

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
