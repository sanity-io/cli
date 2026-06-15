import {execSync} from 'node:child_process'

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
 *
 * - Unix (macOS / Linux): `ps -o lstart=`
 * - Windows: PowerShell `Get-CimInstance Win32_Process` (`CreationDate`).
 *   We prefer CIM over `Get-Process -Id <pid>.StartTime` because `StartTime`
 *   opens a process handle and can throw "Access is denied" when the target
 *   is owned by another user, while `Win32_Process.CreationDate` is readable
 *   for any process the user can enumerate.
 *
 * On Windows the result for {@link process.pid} is memoised because the
 * start time of the current process never changes and PowerShell cold-start
 * is expensive (1–3s). Without the cache, a single `sanity dev` startup
 * spawns PowerShell 4–5 times for our own PID. Other PIDs are not cached —
 * they may be reused over time.
 *
 * Returns `undefined` if the process doesn't exist or the command fails.
 */
let ownWindowsStartTime: {cached: true; date: Date | undefined} | undefined

export function getProcessStartTime(pid: number): Date | undefined {
  if (process.platform === 'win32') {
    if (pid === process.pid && ownWindowsStartTime) return ownWindowsStartTime.date
    const result = readWindowsStartTime(pid)
    if (pid === process.pid) ownWindowsStartTime = {cached: true, date: result}
    return result
  }
  return readUnixStartTime(pid)
}

/** Test-only: clear the cached own-process start time. */
export function __resetStartTimeCacheForTesting(): void {
  ownWindowsStartTime = undefined
}

function readUnixStartTime(pid: number): Date | undefined {
  try {
    const output = execSync(`ps -o lstart= -p ${pid}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 1000,
    }).trim()
    if (!output) return undefined
    const date = new Date(output)
    return Number.isNaN(date.getTime()) ? undefined : date
  } catch {
    return undefined
  }
}

function readWindowsStartTime(pid: number): Date | undefined {
  try {
    // `-NoProfile -NonInteractive` keeps PowerShell start-up minimal.
    // (CIM-vs-Get-Process rationale documented on `getProcessStartTime`.)
    const output = execSync(
      `powershell.exe -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CreationDate.ToString('o')"`,
      {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000},
    ).trim()
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
 * be retrieved (permissions, missing tools, etc.) — in that mode PID-reuse
 * goes undetected, but in practice {@link getProcessStartTime} succeeds on
 * all supported platforms.
 */
export function isOurProcess(pid: number, startedAt: string): boolean {
  if (!isProcessAlive(pid)) return false

  const osStart = getProcessStartTime(pid)
  if (!osStart) return true // can't verify — assume alive is good enough

  const storedStart = new Date(startedAt)
  if (Number.isNaN(storedStart.getTime())) return true // bad stored value — fall back

  return Math.abs(osStart.getTime() - storedStart.getTime()) <= START_TIME_TOLERANCE_MS
}
