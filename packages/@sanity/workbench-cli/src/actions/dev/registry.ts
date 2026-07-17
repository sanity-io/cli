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

import {
  coreAppManifestSchema,
  getSanityDataDir,
  studioManifestSchema,
  subdebug,
} from '@sanity/cli-core'
import {z} from 'zod/mini'

import {AppInterfaceMetadataSchema} from '../../contract.js'
import {canonicalizeWatchDir} from './canonicalizeWatchDir.js'
import {getProcessStartTime, isOurProcess} from './processLiveness.js'

/**
 * The dev-server registry: how a running `sanity dev` / `sanity start` process
 * advertises itself so the workbench on this machine can find and load it.
 *
 * Two kinds of file under `~/.sanity/dev-servers/` do the coordinating:
 *
 *   - `<pid>.json` — one per running app/studio server, holding where it's served
 *     plus its inlined manifest and interfaces. The workbench reads these to
 *     discover and render local apps. Written by `registerDevServer`, watched by
 *     `watchRegistry`.
 *   - `workbench.lock` — a single machine-wide lock, so only one workbench shell
 *     runs at a time and later `dev`s register into it instead of starting their
 *     own. Managed by `acquireWorkbenchLock` / `readWorkbenchLock`.
 *
 * Both files belong to the process that created them and must not outlive it.
 * Three things keep that true: an explicit `release()` on clean shutdown, an
 * `exit` backstop for abrupt exits (`unlinkOnProcessExit`), and a dead-pid prune
 * on read (`isOurProcess`) that clears whatever a crashed process left behind.
 */

const devDebug = subdebug('dev')

/** Bump when the manifest/lock shape changes in a breaking way. */
const REGISTRY_VERSION = 1

/**
 * The current process's start time as reported by the OS, for the `startedAt`
 * that `isOurProcess` checks on re-read. Falls back to now when the OS time is
 * unavailable — `new Date()` alone records the write time, which drifts from
 * process start by enough to look stale and get pruned right after writing.
 */
function ownStartedAt(): string {
  return (getProcessStartTime(process.pid) ?? new Date()).toISOString()
}

const interfaceBaseFields = {
  /** CLI-minted for a local interface; a deployed one gets its id from Brett. */
  id: z.string(),
  moduleId: z.string(),
  name: z.string(),
  /** Raw source vite serves; a deployed interface carries only the `moduleId`. */
  src: z.string(),
  title: z.string(),
  version: z.optional(z.string()),
}

/**
 * A forwarded interface, discriminated on `type`. Kept outside the manifest so
 * the workbench renders local panels and runs workers without a deploy.
 */
const devServerInterfaceSchema = z.discriminatedUnion('type', [
  z.object({
    ...interfaceBaseFields,
    metadata: z.nullable(AppInterfaceMetadataSchema),
    type: z.literal('app'),
  }),
  z.object({...interfaceBaseFields, metadata: z.null(), type: z.literal('panel')}),
  z.object({...interfaceBaseFields, metadata: z.null(), type: z.literal('worker')}),
])

const devServerManifestSchema = z.object({
  /**
   * Field schema *values* load from the federation module; each field's `src`
   * rides along so a repoint bumps the exposes-set id and forces a rebuild.
   * Lenient — the workbench is the authority.
   */
  configs: z.optional(
    z.array(
      z.object({
        // Identifies the owning app when it has no app id (singletons).
        appType: z.optional(z.string()),
        fields: z.array(
          z.object({
            name: z.string(),
            public: z.optional(z.boolean()),
            src: z.string(),
            title: z.string(),
          }),
        ),
        // Content hash of the config — the workbench's change-detection key
        // (see deriveConfigs).
        id: z.string(),
        // The app's `unstable_defineApp` name — the module-federation alias the
        // workbench loads this config's live values from.
        moduleName: z.optional(z.string()),
        // Config contract version the generated module exports, so the
        // workbench knows what it can resolve before loading the module.
        version: z.number(),
      }),
    ),
  ),
  host: z.string(),
  id: z.optional(z.string()),
  interfaces: z.optional(z.array(devServerInterfaceSchema)),
  /**
   * Inlined manifest — either a {@link StudioManifest} or {@link CoreAppManifest},
   * validated against the shared cli-core schemas. The registry stores and
   * rebroadcasts it; the CLI is what extracts and writes it.
   */
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
 * The workbench singleton is tracked separately via the lock file — see
 * `acquireWorkbenchLock` and `readWorkbenchLock` below.
 */
export type DevServerManifest = z.infer<typeof devServerManifestSchema>

/**
 * Path to the dev server registry directory. Lives under the shared Sanity
 * config directory to stay consistent with other CLI paths.
 */
function getRegistryDir(): string {
  return join(getSanityDataDir(), 'dev-servers')
}

// One shared `exit` listener drives every registered cleanup, so N locks/entries
// don't each add a listener and trip Node's MaxListeners warning.
const exitCleanups = new Set<() => void>()
let exitListenerInstalled = false

function runExitCleanups(): void {
  for (const cleanup of exitCleanups) cleanup()
}

/** Exercise the exit backstop in tests without terminating the process; not part
 * of the package's public surface. */
export const runRegistryExitCleanupForTesting = runExitCleanups

/**
 * Delete a registry file synchronously on process exit, as a backstop for abrupt
 * termination. Vite installs its own SIGTERM handler that calls `process.exit()`,
 * which can outrun the async server teardown and leave the lock or registry entry
 * behind — a stray dev-server that lingers until the dead-pid prune clears it. The
 * `exit` event only runs synchronous work, hence `unlinkSync`. `ownedByUs` guards
 * the shared lock so a successor that reacquired it isn't wiped. Returns a
 * detacher to call after a clean release.
 */
function unlinkOnProcessExit(filePath: string, ownedByUs: () => boolean): () => void {
  const cleanup = () => {
    if (!ownedByUs()) return
    try {
      unlinkSync(filePath)
    } catch {
      // The file may already have been removed during shutdown.
    }
  }
  exitCleanups.add(cleanup)

  if (!exitListenerInstalled) {
    exitListenerInstalled = true
    process.once('exit', runExitCleanups)
  }

  return () => exitCleanups.delete(cleanup)
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

  let current: DevServerManifest = {
    ...manifest,
    pid: process.pid,
    startedAt: ownStartedAt(),
    version: REGISTRY_VERSION,
  }

  const filePath = join(registryDir, `${process.pid}.json`)
  writeFileSync(filePath, JSON.stringify(current, null, 2))

  // Guard against late updates from background tasks (e.g. the initial
  // manifest extraction) landing after `release()` has deleted the file —
  // without this, the update would re-create the registry entry and leak.
  let released = false

  // The file is pid-named, so it's always ours to remove on exit.
  const detachExitCleanup = unlinkOnProcessExit(filePath, () => !released)

  return {
    release() {
      released = true
      detachExitCleanup()
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

// The workbench singleton lock — "one workbench per machine". Lives in the same
// registry dir and shares the liveness/prune model: a stale lock left by a
// crashed process is pruned on read so the next acquire isn't blocked forever.

const workbenchLockSchema = z.object({
  host: z.string(),
  pid: z.number(),
  port: z.number(),
  startedAt: z.string(),
  version: z.literal(REGISTRY_VERSION),
})

/**
 * Read the workbench lock file and return its contents if the holding
 * process is still alive. Prunes stale locks from crashed processes.
 */
export function readWorkbenchLock(): z.infer<typeof workbenchLockSchema> | undefined {
  const lockPath = join(getRegistryDir(), 'workbench.lock')

  let contents: string
  try {
    contents = readFileSync(lockPath, 'utf8')
  } catch {
    // File doesn't exist — nothing to prune, nothing to return
    return undefined
  }

  // Past this point the file exists. Anything that isn't a live, valid lock
  // (unparsable JSON, schema mismatch, dead/reused PID) is stale and must be
  // pruned — otherwise the next `acquireWorkbenchLock` call is blocked by
  // EEXIST forever and `sanity dev` silently no-ops the workbench server.
  const data = parseLockContents(contents)
  devDebug('Read workbench lock: %o', data)
  if (data && isOurProcess(data.pid, data.startedAt)) {
    devDebug('Workbench process is alive at pid %d on port %d', data.pid, data.port)
    return data
  }

  pruneWorkbenchLock(lockPath)
  return undefined
}

function parseLockContents(contents: string): z.infer<typeof workbenchLockSchema> | undefined {
  try {
    const {data, success} = workbenchLockSchema.safeParse(JSON.parse(contents))
    return success ? data : undefined
  } catch {
    return undefined
  }
}

function pruneWorkbenchLock(lockPath: string): void {
  try {
    devDebug('Removing stale workbench lock')
    unlinkSync(lockPath)
    devDebug('Stale workbench lock removed')
  } catch {
    // Another process may have already cleaned it up
  }
}

interface WorkbenchLock {
  /** Release the lock file. */
  release: () => void
  /** Update the lock with the actual port after the server starts listening. */
  updatePort: (port: number) => void
}

/**
 * Attempt to acquire an exclusive lock for the workbench process.
 * Uses `O_EXCL` (the `wx` flag) which is atomic at the OS level — only one
 * process can create the file.
 *
 * The lock stores `{pid, host, port}` so other processes can find the
 * running workbench. Call `updatePort` after the Vite server starts to
 * write the actual port (Vite may pick a different one).
 *
 * @returns A {@link WorkbenchLock} if acquired, or `undefined` if another
 *          live process already holds it.
 */
export function acquireWorkbenchLock(
  info: {host: string; port: number},
  retries = 1,
): WorkbenchLock | undefined {
  const registryDir = getRegistryDir()
  mkdirSync(registryDir, {recursive: true})

  const lockPath = join(registryDir, 'workbench.lock')
  const startedAt = ownStartedAt()
  const lockData = {
    host: info.host,
    pid: process.pid,
    port: info.port,
    startedAt,
    version: REGISTRY_VERSION,
  }

  devDebug('Acquiring workbench lock at %s', lockPath)

  try {
    writeFileSync(lockPath, JSON.stringify(lockData), {flag: 'wx'})
    devDebug('Workbench lock acquired')

    let released = false
    // Only wipe the lock on exit if it's still ours — a successor that reacquired
    // it after our own release must not be clobbered.
    const detachExitCleanup = unlinkOnProcessExit(lockPath, () => {
      if (released) return false
      try {
        const disk = parseLockContents(readFileSync(lockPath, 'utf8'))
        return disk?.pid === process.pid && disk.startedAt === startedAt
      } catch {
        return false
      }
    })

    return {
      release() {
        released = true
        detachExitCleanup()
        try {
          unlinkSync(lockPath)
        } catch {
          // Already cleaned up
        }
      },
      updatePort(port: number) {
        writeFileSync(lockPath, JSON.stringify({...lockData, port}))
      },
    }
  } catch (err: unknown) {
    devDebug(
      'Failed to acquire workbench lock: %s',
      err instanceof Error ? err.message : String(err),
    )
    if (!isNodeError(err) || err.code !== 'EEXIST') return undefined

    // Lock exists — check if the holder is still alive
    const existing = readWorkbenchLock()
    if (existing) return undefined

    // Stale lock was pruned by readWorkbenchLock — retry (with guard against infinite recursion)
    if (retries <= 0) return undefined
    return acquireWorkbenchLock(info, retries - 1)
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}
