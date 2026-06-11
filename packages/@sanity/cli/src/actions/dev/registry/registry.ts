import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  watch,
  writeFileSync,
} from 'node:fs'
import {join} from 'node:path'

import {getSanityDataDir} from '@sanity/cli-core'
import {z} from 'zod/mini'

import {coreAppManifestSchema, studioManifestSchema} from '../../manifest/types.js'
import {canonicalizeWatchDir} from '../shared/canonicalizeWatchDir.js'
import {getProcessStartTime, isOurProcess} from './processLiveness.js'

/** Bump when the manifest/lock shape changes in a breaking way. */
export const REGISTRY_VERSION = 1

const devServerManifestSchema = z.object({
  host: z.string(),
  id: z.optional(z.string()),
  /**
   * Interfaces the app exposes, mapped from the declared `views` (dock panels,
   * `interface_type: "panel"`) and `services` (background workers,
   * `interface_type: "worker"`). A service is just an interface, so both live
   * in this one list. Carried separately from the manifest — interfaces live in
   * the application service, not the manifest — so the workbench can render
   * local panels and run local workers without a deploy. `entry_point` is the
   * declared `src`. Lenient by design; the workbench is the authority on the
   * interface shape.
   */
  interfaces: z.optional(
    z.array(z.object({entry_point: z.string(), interface_type: z.string(), name: z.string()})),
  ),
  /** Inlined manifest — either a {@link StudioManifest} or {@link CoreAppManifest}. */
  manifest: z.optional(z.union([studioManifestSchema, coreAppManifestSchema])),
  /**
   * ISO timestamp of the most recent successful manifest extraction. Bumped
   * on every regeneration so re-writing this registry entry triggers the
   * workbench `watchRegistry` watcher and forces a rebroadcast to clients.
   */
  manifestUpdatedAt: z.optional(z.string()),
  pid: z.number(),
  port: z.number(),
  projectId: z.optional(z.string()),
  startedAt: z.string(),
  type: z.enum(['coreApp', 'studio']),
  version: z.literal(REGISTRY_VERSION),
  workDir: z.string(),
})
/**
 * A manifest describing a running dev server process (studio or app).
 * Stored as `~/.sanity/dev-servers/<pid>.json`.
 *
 * Workbench state is tracked separately via the lock file — see
 * `acquireWorkbenchLock` and `readWorkbenchLock` in `workbenchLock.ts`.
 */
export type DevServerManifest = z.infer<typeof devServerManifestSchema>

/**
 * Returns the path to the dev server registry directory.
 * Uses the shared Sanity config directory to stay consistent with other CLI paths.
 */
export function getRegistryDir(): string {
  return join(getSanityDataDir(), 'dev-servers')
}

interface DevServerRegistration {
  /** Remove the registry entry. */
  release: () => void
  /**
   * Rewrite the registry entry with partial updates merged in. Also bumps the
   * file's mtime, which fires `watchRegistry` in any workbench process and
   * triggers a rebroadcast to connected clients.
   */
  update: (patch: Partial<Omit<DevServerManifest, 'pid' | 'startedAt' | 'version'>>) => void
}

/**
 * Write a manifest file for the current process and return a handle with a
 * `release` function that removes it plus an `update` function for patching
 * fields post-registration. Uses synchronous I/O so the file exists before
 * any signal handler could fire.
 */
export function registerDevServer(
  manifest: Omit<DevServerManifest, 'pid' | 'startedAt' | 'version'>,
): DevServerRegistration {
  const registryDir = getRegistryDir()
  mkdirSync(registryDir, {recursive: true})

  // Use the OS-reported process start time (falling back to now) so that
  // `isOurProcess` can verify the manifest against the same reference on
  // re-read. Using `new Date()` would record the manifest-write time, which
  // drifts from the OS-reported process start by however long it took the
  // process to reach this point — frequently exceeding START_TIME_TOLERANCE_MS
  // and causing the manifest to be pruned as "stale" immediately after it's
  // written.
  let current: DevServerManifest = {
    ...manifest,
    pid: process.pid,
    startedAt: (getProcessStartTime(process.pid) ?? new Date()).toISOString(),
    version: REGISTRY_VERSION,
  }

  const filePath = join(registryDir, `${process.pid}.json`)
  writeFileSync(filePath, JSON.stringify(current, null, 2))

  // Guard against late updates from background tasks (e.g. the initial
  // manifest extraction) landing after `release()` has deleted the file —
  // without this, the update would re-create the registry entry and leak.
  let released = false

  return {
    release() {
      released = true
      try {
        unlinkSync(filePath)
      } catch {
        // ENOENT is fine — already cleaned up
      }
    },
    update(patch) {
      if (released) return
      current = {...current, ...patch}
      writeFileSync(filePath, JSON.stringify(current, null, 2))
    },
  }
}

/**
 * Read all manifest files from the registry, prune stale entries (dead PIDs),
 * and return the live ones.
 */
export function getRegisteredServers(): DevServerManifest[] {
  const registryDir = getRegistryDir()

  if (!existsSync(registryDir)) {
    return []
  }

  const files = readdirSync(registryDir).filter((f) => f.endsWith('.json'))
  const servers: DevServerManifest[] = []

  for (const file of files) {
    const filePath = join(registryDir, file)
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(filePath, 'utf8'))
    } catch {
      continue
    }

    const {data, success} = devServerManifestSchema.safeParse(raw)
    if (!success) continue

    if (isOurProcess(data.pid, data.startedAt)) {
      servers.push(data)
    } else {
      // Prune stale manifest
      try {
        unlinkSync(filePath)
      } catch {
        // Ignore — another process may have already cleaned it up
      }
    }
  }

  return servers
}

interface RegistryWatcher {
  close(): void
}

/**
 * Watch the registry directory for changes and invoke the callback with the
 * current list of live servers whenever a change is detected.
 *
 * Uses `fs.watch` with a debounce to coalesce rapid file changes (e.g. a
 * server starting and writing its manifest triggers multiple FS events).
 */
export function watchRegistry(callback: (servers: DevServerManifest[]) => void): RegistryWatcher {
  const registryDir = getRegistryDir()
  mkdirSync(registryDir, {recursive: true})

  // Canonicalize to the real long path so `fs.watch` doesn't abort on Windows
  // short-path dirs. See `canonicalizeWatchDir`.
  const watchDir = canonicalizeWatchDir(registryDir)

  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const notify = () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      callback(getRegisteredServers())
    }, 50)
  }

  const watcher = watch(watchDir, notify)

  return {
    close() {
      clearTimeout(debounceTimer)
      watcher.close()
    },
  }
}
