import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  watch,
  writeFileSync,
} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {z} from 'zod/mini'

const devServerManifestSchema = z.object({
  host: z.string(),
  pid: z.number(),
  port: z.number(),
  startedAt: z.string(),
  type: z.enum(['app', 'studio', 'workbench']),
  workDir: z.string(),

  projectId: z.optional(z.string()),
})

/**
 * A manifest describing a running dev server process.
 * Stored as `~/.sanity/dev-servers/<pid>.json`.
 */
export type DevServerManifest = z.infer<typeof devServerManifestSchema>

/**
 * Returns the path to the dev server registry directory.
 * Respects `SANITY_INTERNAL_ENV=staging` to isolate staging instances.
 */
function getRegistryDir(): string {
  const suffix = process.env.SANITY_INTERNAL_ENV === 'staging' ? '-staging' : ''
  return join(homedir(), `.sanity${suffix}`, 'dev-servers')
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

/**
 * Write a manifest file for the current process and return a cleanup function
 * that removes it. Uses synchronous I/O so the file exists before any signal
 * handler could fire.
 */
export function registerDevServer(
  manifest: Omit<DevServerManifest, 'pid' | 'startedAt'>,
): () => void {
  const registryDir = getRegistryDir()
  mkdirSync(registryDir, {recursive: true})

  const fullManifest: DevServerManifest = {
    ...manifest,
    pid: process.pid,
    startedAt: new Date().toISOString(),
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

    if (isProcessAlive(data.pid)) {
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
 * Find a live workbench in the registry.
 */
export function findLiveWorkbench(): DevServerManifest | undefined {
  return getRegisteredServers().find((s) => s.type === 'workbench')
}

/**
 * Attempt to acquire an exclusive lock for the workbench process.
 * Uses `O_EXCL` (the `wx` flag) which is atomic at the OS level — only one
 * process can create the file. The lock contains the owning PID so stale
 * locks from crashed processes can be detected and reclaimed.
 *
 * @returns A release function if the lock was acquired, or `undefined` if
 *          another live process already holds it.
 */
export function acquireWorkbenchLock(): (() => void) | undefined {
  const registryDir = getRegistryDir()
  mkdirSync(registryDir, {recursive: true})

  const lockPath = join(registryDir, 'workbench.lock')

  try {
    writeFileSync(lockPath, String(process.pid), {flag: 'wx'})
    return () => {
      try {
        unlinkSync(lockPath)
      } catch {
        // Already cleaned up
      }
    }
  } catch (err: unknown) {
    if (!isNodeError(err) || err.code !== 'EEXIST') return undefined

    // Lock exists — check if the holder is still alive
    let holderPid: number
    try {
      holderPid = Number.parseInt(readFileSync(lockPath, 'utf8'), 10)
    } catch {
      return undefined
    }

    if (isProcessAlive(holderPid)) return undefined

    // Stale lock from a crashed process — reclaim it
    try {
      unlinkSync(lockPath)
    } catch {
      return undefined
    }

    return acquireWorkbenchLock()
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
