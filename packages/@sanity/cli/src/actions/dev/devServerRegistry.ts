import {execSync} from 'node:child_process'
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

import {devDebug} from './devDebug.js'

/** Bump when the manifest/lock shape changes in a breaking way. */
const REGISTRY_VERSION = 1

const workbenchLockSchema = z.object({
  host: z.string(),
  pid: z.number(),
  port: z.number(),
  startedAt: z.string(),
  version: z.literal(REGISTRY_VERSION),
})

const devServerManifestSchema = z.extend(workbenchLockSchema, {
  startedAt: z.string(),
  type: z.enum(['coreApp', 'studio']),
  workDir: z.string(),
})
/**
 * A manifest describing a running dev server process (studio or app).
 * Stored as `~/.sanity/dev-servers/<pid>.json`.
 *
 * Workbench state is tracked separately via the lock file — see
 * {@link acquireWorkbenchLock} and {@link readWorkbenchLock}.
 */
export type DevServerManifest = z.infer<typeof devServerManifestSchema>

/**
 * Returns the path to the dev server registry directory.
 * Uses the shared Sanity config directory to stay consistent with other CLI paths.
 */
function getRegistryDir(): string {
  return join(getSanityDataDir(), 'dev-servers')
}

/**
 * Check whether a process is still alive.
 * Sends signal 0 which doesn't kill anything — just checks existence.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err: unknown) {
    // EPERM means the process exists but we lack permission to signal it
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EPERM') {
      return true
    }
    return false
  }
}

/** Tolerance in ms when comparing stored vs OS-reported process start times. */
const START_TIME_TOLERANCE_MS = 2000

/**
 * Retrieve the OS-reported start time for a process.
 * Uses `ps -o lstart=` which works on both macOS and Linux.
 * Returns `undefined` if the process doesn't exist or the command fails.
 */
function getProcessStartTime(pid: number): Date | undefined {
  try {
    const output = execSync(`ps -o lstart= -p ${pid}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim()
    if (!output) return undefined
    const date = new Date(output)
    return Number.isNaN(date.getTime()) ? undefined : date
  } catch {
    return undefined
  }
}

/**
 * Check whether a process is alive **and** is the same process that wrote
 * the manifest/lock (not a PID that was reused by the OS after a crash).
 *
 * Compares the stored `startedAt` timestamp against the OS-reported process
 * start time. Falls back to a plain alive-check when the start time cannot
 * be retrieved (unsupported platform, permissions, etc.).
 */
function isOurProcess(pid: number, startedAt: string): boolean {
  if (!isProcessAlive(pid)) return false

  const osStart = getProcessStartTime(pid)
  if (!osStart) return true // can't verify — assume alive is good enough

  const storedStart = new Date(startedAt)
  if (Number.isNaN(storedStart.getTime())) return true // bad stored value — fall back

  return Math.abs(osStart.getTime() - storedStart.getTime()) <= START_TIME_TOLERANCE_MS
}

/**
 * Write a manifest file for the current process and return a cleanup function
 * that removes it. Uses synchronous I/O so the file exists before any signal
 * handler could fire.
 */
export function registerDevServer(
  manifest: Omit<DevServerManifest, 'pid' | 'startedAt' | 'version'>,
): () => void {
  const registryDir = getRegistryDir()
  mkdirSync(registryDir, {recursive: true})

  const fullManifest: DevServerManifest = {
    ...manifest,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    version: REGISTRY_VERSION,
  }

  const filePath = join(registryDir, `${process.pid}.json`)
  writeFileSync(filePath, JSON.stringify(fullManifest, null, 2))

  return () => {
    try {
      unlinkSync(filePath)
    } catch {
      // ENOENT is fine — already cleaned up
    }
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

/**
 * Read the workbench lock file and return its contents if the holding
 * process is still alive. Prunes stale locks from crashed processes.
 */
export function readWorkbenchLock(): z.infer<typeof workbenchLockSchema> | undefined {
  const lockPath = join(getRegistryDir(), 'workbench.lock')

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(lockPath, 'utf8'))
  } catch {
    return undefined
  }

  const {data, success} = workbenchLockSchema.safeParse(raw)

  devDebug('Read workbench lock: %o', data)

  if (success && isOurProcess(data.pid, data.startedAt)) {
    devDebug('Workbench process is alive at pid %d on port %d', data.pid, data.port)
    return data
  }

  // Stale lock — prune it
  try {
    devDebug('Removing stale workbench lock')
    unlinkSync(lockPath)
    devDebug('Stale workbench lock removed')
  } catch {
    // Another process may have already cleaned it up
  }
  return undefined
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
  const startedAt = new Date().toISOString()
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
    return {
      release() {
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

  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const notify = () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      callback(getRegisteredServers())
    }, 50)
  }

  const watcher = watch(registryDir, notify)

  return {
    close() {
      clearTimeout(debounceTimer)
      watcher.close()
    },
  }
}
