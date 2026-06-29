import {watch} from 'node:fs'
import {basename, dirname} from 'node:path'

import {findProjectRoot} from '@sanity/cli-core/config'
import {subdebug} from '@sanity/cli-core/debug'
import {type Output} from '@sanity/cli-core/types'

import {canonicalizeWatchDir} from './canonicalizeWatchDir.js'
import {type DevServerInterface} from './deriveInterfaces.js'

const devDebug = subdebug('dev')

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
   * re-syncs live like `title`/`icon`. `undefined` only for
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

  /**
   * Extra config filenames (basenames in the project root directory) that also
   * trigger a regeneration. Studios resolve their project root via
   * `sanity.config.*` but declare workbench interfaces in `sanity.cli.*`, so
   * their watcher needs to react to both files.
   */
  extraWatchFilenames?: readonly string[]
}

/**
 * Generate the project manifest once and then keep it in sync with the
 * project's config file (`sanity.config.(ts|js)` for studios,
 * `sanity.cli.(ts|js)` for core-apps) on disk. The initial generation runs
 * fire-and-forget so it doesn't block dev-server startup; subsequent
 * file-system events are coalesced behind it, so the extractor never has
 * overlapping writes to its shared output directory. Each successful
 * regeneration inlines the new manifest into the registry via the `update`
 * callback, so any running workbench rebroadcasts to its clients.
 *
 * Errors during extraction are logged as warnings and do not crash the dev
 * server — the previously extracted manifest (if any) stays in the
 * registry.
 */
export async function startDevManifestWatcher<T>({
  extract,
  extraWatchFilenames,
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

  // Route the initial extraction through `regenerate` too, so file-system
  // events arriving before it finishes get coalesced rather than racing it
  // for the shared output directory.
  void regenerate()

  // Watch the config file's parent directory and filter by filename.
  // Watching the file itself is unreliable across editors that perform
  // atomic-save (delete + rename) — the watcher loses its target once the
  // inode changes. Directory watches survive those transitions.
  // Canonicalize to the real long path so `fs.watch` doesn't abort on Windows
  // short-path dirs. See `canonicalizeWatchDir`.
  const configDir = canonicalizeWatchDir(dirname(configPath))
  const watchFilenames = new Set([basename(configPath), ...(extraWatchFilenames ?? [])])

  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const onEvent = (_event: string, filename: Buffer | string | null) => {
    if (!filename) return
    const name = typeof filename === 'string' ? filename : filename.toString('utf8')
    if (!watchFilenames.has(name)) return
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
    // Idempotent — a repeat close (e.g. a signal handler racing an explicit
    // close) is a no-op, so we never clear an already-cleared timer or
    // double-close the underlying watcher.
    close: async () => {
      if (closed) return
      closed = true
      clearTimeout(debounceTimer)
      watcher.close()
    },
  }
}
