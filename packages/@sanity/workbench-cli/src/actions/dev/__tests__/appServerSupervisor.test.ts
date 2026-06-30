import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  type AppServerResult,
  type StartAppServer,
  startAppServerSupervisor,
} from '../appServerSupervisor.js'
import {workbenchCliConfig} from './devTestHelpers.js'

const mockGetCliConfigUncached = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/config/cli/getCliConfig', () => ({
  getCliConfigUncached: mockGetCliConfigUncached,
}))

function mockAppServer({port = 3334}: {port?: number} = {}): Extract<
  AppServerResult,
  {started: true}
> {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    server: {config: {server: {port}}} as never,
    started: true,
  }
}

async function startSupervisor(start: StartAppServer) {
  const result = await startAppServerSupervisor({
    cliConfig: workbenchCliConfig(),
    start,
    workDir: '/tmp/sanity-project',
  })
  if (!result.started) throw new Error('expected the supervisor to start')
  return result.supervisor
}

describe('startAppServerSupervisor', () => {
  beforeEach(() => {
    mockGetCliConfigUncached.mockResolvedValue(workbenchCliConfig())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('passes through an expected early exit from the initial start', async () => {
    const start = vi.fn().mockResolvedValue({reason: 'missing-organization-id', started: false})

    const result = await startAppServerSupervisor({
      cliConfig: workbenchCliConfig(),
      start,
      workDir: '/tmp/sanity-project',
    })

    expect(result).toEqual({reason: 'missing-organization-id', started: false})
  })

  test('rebuild closes the current server and starts a fresh one with the reloaded config', async () => {
    const first = mockAppServer({port: 3334})
    const second = mockAppServer({port: 3335})
    const start = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const freshConfig = workbenchCliConfig()
    mockGetCliConfigUncached.mockResolvedValue(freshConfig)

    const supervisor = await startSupervisor(start)

    await expect(supervisor.rebuild()).resolves.toBe(second.server)
    expect(first.close).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenLastCalledWith(freshConfig)
    // The live server re-points at the replacement.
    expect(supervisor.server).toBe(second.server)
  })

  test('rebuild rejects when the restart reports an expected early exit', async () => {
    const start = vi
      .fn()
      .mockResolvedValueOnce(mockAppServer())
      .mockResolvedValueOnce({reason: 'missing-organization-id', started: false})

    const supervisor = await startSupervisor(start)

    await expect(supervisor.rebuild()).rejects.toThrow(
      'Dev server did not restart after the view/service change',
    )
  })

  test('refuses a rebuild once close has started shutdown', async () => {
    const supervisor = await startSupervisor(vi.fn().mockResolvedValue(mockAppServer()))

    await supervisor.close()

    await expect(supervisor.rebuild()).rejects.toThrow('Dev server is shutting down')
  })

  test('close waits out an in-flight rebuild and closes the replacement', async () => {
    const first = mockAppServer()
    const second = mockAppServer()
    let releaseStart!: () => void
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve
    })
    const start = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(async () => {
        await startGate
        return second
      })

    const supervisor = await startSupervisor(start)

    const rebuild = supervisor.rebuild()
    const closing = supervisor.close()
    releaseStart()

    await rebuild
    await closing
    expect(second.close).toHaveBeenCalledTimes(1)
  })
})
