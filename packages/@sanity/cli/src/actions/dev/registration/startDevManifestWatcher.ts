import {watch} from 'node:fs'
import {basename, dirname} from 'node:path'

import {findProjectRoot, type Output} from '@sanity/cli-core'

import {devDebug} from '../devDebug.js'
import {canonicalizeWatchDir} from '../shared/canonicalizeWatchDir.js'
import {type DevServerInterface} from './deriveInterfaces.js'

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
interface ManifestPatch<T> {
  manifest: T | undefined
  manifestUpdatedAt: string

  /**
   * Workbench interfaces (views/services/app view) re-derived from the config
   * on each change, so editing `views`/`services`/`entry` in `sanity.cli.ts`
   * re-syncs live like `title`/`icon` (FR-024). `undefined` only for
   * non-branded configs — the registry patch is a shallow merge, so extractors
   * must re-derive rather than omit, or the registered set gets wiped.
   */
  interfaces?: DevServerInterface[] | undefined
}

interface StartDevManifestWatcherOptions<T> {
  /**
   * Run the project-specific extraction and resolve to the inlined manifest
   * plus the workbench `interfaces[]` (when the project declares them).
   * Receives the resolved config path (e.g. `sanity.config.ts` for studios,
   * `sanity.cli.ts` for core-apps) and the working directory.
   */
  extract: (params: {
    configPath: string
    workDir: string
  }) => Promise<{interfaces?: DevServerInterface[] | undefined; manifest: T | undefined}>
  output: Output
  /**
   * Called after every successful extraction with the inlined manifest +
   * interfaces. Awaited, so an interface-set change can rebuild the federation
   * remote before the registry is patched (which is what reloads the workbench).
   */
  update: (patch: ManifestPatch<T>) => Promise<void> | void
  workDir: string
}

/**
 * Generate the project manifest once and then keep it in sync with the
 * project's config file (`sanity.config.(ts|js)` for studios,
 * `sanity.cli.(ts|js)` for core-apps) on disk. The initial generation runs
 * fire-and-forget so it doesn't block dev-server startup; subsequent
 * file-system events are coalesced behind it via `running`/`pending`, so
 * the single-serializer guarantees there are no overlapping writes to any
 * shared output directory used by the extractor. Each successful
 * regeneration inlines the new manifest into the registry via the `update`
 * callback, so any running workbench rebroadcasts to its clients.
 *
 * Errors during extraction are logged as warnings and do not crash the dev
 * server — the previously extracted manifest (if any) stays in the
 * registry.
 */
export async function startDevManifestWatcher<T>({
  extract,
  output,
  update,
  workDir,
}: StartDevManifestWatcherOptions<T>): Promise<DevManifestWatcher> {
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
      const {interfaces, manifest} = await extract({configPath, workDir})
      if (closed) return
      await update({interfaces, manifest, manifestUpdatedAt: new Date().toISOString()})
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

  // Kick off the initial extraction in the background. Routing it through
  // `regenerate` means any file-system events arriving before the first
  // extraction finishes will be coalesced by `running`/`pending` rather
  // than racing against it for the shared output directory.
  void regenerate()

  // Watch the config file's parent directory and filter by filename.
  // Watching the file itself is unreliable across editors that perform
  // atomic-save (delete + rename) — the watcher loses its target once the
  // inode changes. Directory watches survive those transitions.
  // Canonicalize to the real long path so `fs.watch` doesn't abort on Windows
  // short-path dirs. See `canonicalizeWatchDir`.
  const configDir = canonicalizeWatchDir(dirname(configPath))
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
    output.warn(`Manifest watcher error: ${err instanceof Error ? err.message : String(err)}`)
  })

  return {
    close: async () => {
      closed = true
      clearTimeout(debounceTimer)
      watcher.close()
    },
  }
}
