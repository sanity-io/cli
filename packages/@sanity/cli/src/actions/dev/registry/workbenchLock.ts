import {mkdirSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {z} from 'zod/mini'

import {devDebug} from '../devDebug.js'
import {getProcessStartTime, isOurProcess} from './processLiveness.js'
import {getRegistryDir, REGISTRY_VERSION} from './registry.js'

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
  // Use OS-reported process start time for consistent comparison in
  // `isOurProcess`. See the identical note in `registerDevServer`.
  const startedAt = (getProcessStartTime(process.pid) ?? new Date()).toISOString()
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
