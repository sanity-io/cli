import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Takes a machine-wide lock so only one measurement runs at a time. Parallel
 * runs would compete for CPU and bandwidth and skew each other's timings.
 * A lock left behind by a process that no longer exists is taken over.
 */
export async function acquireLock(
  stateDir: string,
  options: {onWait?: (holder: number) => void; pollMs?: number} = {},
): Promise<() => Promise<void>> {
  const dir = join(stateDir, 'lock')
  const pidFile = join(dir, 'pid')
  await mkdir(stateDir, {recursive: true})
  let announced = false

  for (;;) {
    try {
      await mkdir(dir)
      await writeFile(pidFile, String(process.pid))
      return () => rm(dir, {force: true, recursive: true})
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }

    const holder = Number(await readFile(pidFile, 'utf8').catch(() => ''))
    if (!holder || !isRunning(holder)) {
      await rm(dir, {force: true, recursive: true})
      continue
    }
    if (!announced) {
      options.onWait?.(holder)
      announced = true
    }
    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 2000))
  }
}
