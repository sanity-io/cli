import {basename, dirname} from 'node:path'

import {findProjectRoot, type Output, subdebug} from '@sanity/cli-core'

import {type DevServerConfig, type DevServerInterface} from './deriveConfigs.js'
import {watchConfigFiles} from './watchConfigFiles.js'

const devDebug = subdebug('dev')

interface DevManifestWatcher {
  close: () => Promise<void>
}

/** Subset of registry fields the watcher is allowed to update. */
interface ManifestPatch<T> {
  manifest: T | undefined
  manifestUpdatedAt: string

  /** Same re-derive-don't-omit contract as `interfaces`. */
  configs?: DevServerConfig[] | undefined
  /**
   * Workbench interfaces (views/web workers/app view) re-derived from the config
   * on each change, so editing `views`/`webWorkers`/`entry` in `sanity.cli.ts`
   * re-syncs live like `title`/`icon`. `undefined` only for
   * non-branded configs — the registry patch is a shallow merge, so extractors
   * must re-derive rather than omit, or the registered set gets wiped.
   */
  interfaces?: DevServerInterface[] | undefined
}

interface StartDevManifestWatcherOptions<T> {
  /**
   * Run the project-specific extraction and resolve to the manifest patch, which
   * the watcher stamps with `manifestUpdatedAt` before forwarding. Receives the
   * resolved config path (`sanity.config.ts` for studios, `sanity.cli.ts` for
   * core-apps) and the working directory.
   */
  extract: (params: {
    configPath: string
    workDir: string
  }) => Promise<Omit<ManifestPatch<T>, 'manifestUpdatedAt'>>
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

  let closed = false

  const watcher = watchConfigFiles({
    dir: dirname(configPath),
    filenames: [basename(configPath), ...(extraWatchFilenames ?? [])],
    onChange: async () => {
      try {
        const {configs, interfaces, manifest} = await extract({configPath, workDir})
        if (closed) return
        await update({
          configs,
          interfaces,
          manifest,
          manifestUpdatedAt: new Date().toISOString(),
        })
      } catch (err) {
        // Extractors print their own spinner failure; log the reason here so
        // the user sees what went wrong alongside the spinner indicator.
        devDebug('Manifest regeneration failed: %O', err)
        output.warn(
          `Could not extract manifest for the Dashboard: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    },
    onError: (err) => {
      devDebug('Config watcher error: %O', err)
      output.warn(`Manifest watcher error: ${err instanceof Error ? err.message : String(err)}`)
    },
  })

  // Route the initial extraction through the watcher too, so file-system events
  // arriving before it finishes get coalesced rather than racing it for the
  // shared output directory.
  watcher.run()

  return {
    close: async () => {
      closed = true
      watcher.close()
    },
  }
}
