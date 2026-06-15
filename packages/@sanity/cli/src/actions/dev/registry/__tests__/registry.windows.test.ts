/**
 * Windows-only integration tests for {@link getProcessStartTime} and the
 * registry/lock plumbing that depends on it.
 *
 * Unlike `registry.test.ts`, this file does **not** mock
 * `node:child_process` — it shells out to a real PowerShell so we catch
 * regressions where the command doesn't run, the output format drifts, or
 * `Get-Process` behaves differently on a real Windows host.
 *
 * Skipped on macOS / Linux. The matching `windows-8core` shards in CI run
 * this file end-to-end.
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {__resetStartTimeCacheForTesting} from '../processLiveness.js'
import {acquireWorkbenchLock, getRegisteredServers, registerDevServer} from '../registry.js'

let testDataDir: string

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getSanityDataDir: () => testDataDir,
  }
})

beforeEach(() => {
  testDataDir = join(tmpdir(), `sanity-registry-win-${process.pid}-${Date.now()}`)
  mkdirSync(testDataDir, {recursive: true})
  __resetStartTimeCacheForTesting()
})

afterEach(() => {
  __resetStartTimeCacheForTesting()
})

function registryDir() {
  return join(testDataDir, 'dev-servers')
}

describe.skipIf(process.platform !== 'win32')('Windows integration', () => {
  test('getProcessStartTime returns a Date close to now for our PID via real PowerShell', () => {
    const {release} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: testDataDir,
    })

    const manifestPath = join(registryDir(), `${process.pid}.json`)
    expect(existsSync(manifestPath)).toBe(true)

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const startedAt = new Date(manifest.startedAt)
    expect(Number.isNaN(startedAt.getTime())).toBe(false)

    // The start time must predate "now" but not be older than this test's
    // process — generous bound covers slow-runner cold-starts.
    const ageMs = Date.now() - startedAt.getTime()
    expect(ageMs).toBeGreaterThanOrEqual(0)
    expect(ageMs).toBeLessThan(15 * 60_000)

    release()
  })

  test('round-trip: register → re-read keeps our manifest live (PowerShell-verified)', () => {
    const {release} = registerDevServer({
      host: 'localhost',
      port: 3335,
      type: 'studio',
      workDir: testDataDir,
    })

    // Re-reading invokes isOurProcess(process.pid, ...) which goes through
    // the real PowerShell branch. If the command/output drifts, the
    // manifest gets pruned as "stale" and this returns 0.
    const servers = getRegisteredServers()
    expect(servers).toHaveLength(1)
    expect(servers[0].port).toBe(3335)

    release()
  })

  test('acquireWorkbenchLock round-trip on Windows', () => {
    const claim = acquireWorkbenchLock({host: 'localhost', port: 3336})
    expect(claim.acquired).toBe(true)
    if (!claim.acquired) throw new Error('expected to acquire the workbench lock')

    // A second claim reads the lock back through real PowerShell and finds our
    // live process holding it.
    const second = acquireWorkbenchLock({host: 'localhost', port: 9999})
    expect(second.acquired).toBe(false)
    if (second.acquired) throw new Error('expected the second claim to fail')
    expect(second.heldBy?.pid).toBe(process.pid)
    expect(second.heldBy?.port).toBe(3336)

    claim.lock.release()
  })

  test('reclaims a stale lock on Windows (PID reuse, manually written)', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    // Write a workbench lock claiming our PID started in the distant past. Real
    // PowerShell reports the recent start time of this test process, so
    // isOurProcess sees the mismatch, prunes the stale lock, and the claim wins.
    writeFileSync(
      join(dir, 'workbench.lock'),
      JSON.stringify({
        host: 'localhost',
        pid: process.pid,
        port: 4000,
        startedAt: '2020-01-01T00:00:00.000Z',
        version: 1,
      }),
    )

    const claim = acquireWorkbenchLock({host: 'localhost', port: 4001})
    expect(claim.acquired).toBe(true)
    if (!claim.acquired) throw new Error('expected to reclaim the stale lock')
    claim.lock.release()
  })
})
