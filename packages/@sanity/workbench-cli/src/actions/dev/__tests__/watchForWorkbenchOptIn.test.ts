import {type CliConfig} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {watchForWorkbenchOptIn} from '../watchForWorkbenchOptIn.js'
import {
  createMockOutput,
  FakeFsWatcher,
  mediaLibraryCliConfig,
  workbenchCliConfig,
} from './devTestHelpers.js'

const mockGetCliConfigUncached = vi.hoisted(() => vi.fn())
const mockFsWatch = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getCliConfigUncached: mockGetCliConfigUncached,
}))

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  watch: mockFsWatch,
}))

const WORK_DIR = '/tmp/sanity-project'
const plainCliConfig = {app: {organizationId: 'org-123'}} as CliConfig

function setup() {
  const output = createMockOutput()
  const closePlainServer = vi.fn().mockResolvedValue(undefined)
  const closeWorkbench = vi.fn().mockResolvedValue(undefined)
  const startWorkbench = vi.fn().mockResolvedValue({close: closeWorkbench})
  const watcher = watchForWorkbenchOptIn({
    closePlainServer,
    output,
    startWorkbench,
    workDir: WORK_DIR,
  })

  return {closePlainServer, closeWorkbench, output, startWorkbench, watcher}
}

async function saveCliConfig(filename = 'sanity.cli.ts') {
  fakeWatcher.emitChange(filename)
  await vi.advanceTimersByTimeAsync(300)
}

let fakeWatcher: FakeFsWatcher

describe('watchForWorkbenchOptIn', () => {
  beforeEach(() => {
    fakeWatcher = new FakeFsWatcher()
    mockFsWatch.mockImplementation((_dir: string, listener: FakeFsWatcher['handler']) => {
      fakeWatcher.handler = listener
      return fakeWatcher
    })
    mockGetCliConfigUncached.mockResolvedValue(plainCliConfig)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test.each([
    ['sanity.cli.ts', 'defineApplication', workbenchCliConfig()],
    ['sanity.cli.js', 'unstable_defineMediaLibrary', mediaLibraryCliConfig()],
  ])('hands over to the workbench once %s uses %s', async (filename, _name, optedIn) => {
    const {closePlainServer, closeWorkbench, output, startWorkbench, watcher} = setup()
    mockGetCliConfigUncached.mockResolvedValue(optedIn)

    await saveCliConfig(filename)

    expect(output.log).toHaveBeenCalledWith(`${filename} changed, restarting dev server`)
    expect(closePlainServer).toHaveBeenCalledTimes(1)
    expect(startWorkbench).toHaveBeenCalledWith(optedIn)
    expect(closePlainServer.mock.invocationCallOrder[0]).toBeLessThan(
      startWorkbench.mock.invocationCallOrder[0],
    )
    expect(fakeWatcher.closed).toBe(true)

    await watcher.close()
    expect(closeWorkbench).toHaveBeenCalledTimes(1)
    expect(closePlainServer).toHaveBeenCalledTimes(1)
  })

  test('keeps the plain server while the config is not opted in or does not load', async () => {
    const {closePlainServer, startWorkbench, watcher} = setup()

    await saveCliConfig()
    mockGetCliConfigUncached.mockRejectedValueOnce(new SyntaxError('Unexpected token'))
    await saveCliConfig()

    expect(mockGetCliConfigUncached).toHaveBeenCalledTimes(2)
    expect(startWorkbench).not.toHaveBeenCalled()
    expect(closePlainServer).not.toHaveBeenCalled()
    expect(fakeWatcher.closed).toBe(false)

    await watcher.close()
    expect(closePlainServer).toHaveBeenCalledTimes(1)
    expect(fakeWatcher.closed).toBe(true)
  })

  test('warns and retries on the next save when the workbench fails to start', async () => {
    const {closePlainServer, output, startWorkbench} = setup()
    mockGetCliConfigUncached.mockResolvedValue(workbenchCliConfig())
    startWorkbench.mockRejectedValueOnce(new Error('port in use'))

    await saveCliConfig()

    expect(output.warn).toHaveBeenCalledWith('Failed to start dev server: port in use')
    expect(output.log).toHaveBeenCalledWith(
      'No dev server is running. Save sanity.cli.ts to try again.',
    )
    expect(fakeWatcher.closed).toBe(false)

    await saveCliConfig()

    expect(startWorkbench).toHaveBeenCalledTimes(2)
    expect(closePlainServer).toHaveBeenCalledTimes(1)
    expect(fakeWatcher.closed).toBe(true)
  })
})
