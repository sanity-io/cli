import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

const runTypegenGenerate = vi.hoisted(() =>
  vi.fn<typeof import('@sanity/codegen').runTypegenGenerate>(),
)
// Not strictly typed against `typeof runTypegenWatcher`: its return type includes
// a chokidar `FSWatcher`, but two different chokidar major versions are present in
// this workspace's dependency graph (see pnpm-lock.yaml), so a literal `FSWatcher`
// instance built here doesn't structurally match the one in @sanity/codegen's
// compiled types. The command under test never reads `.watcher` (only `getStats()`
// and `stop()`), so a loosely-typed mock is a deliberate, contained trade-off.
const runTypegenWatcher = vi.hoisted(() => vi.fn())

vi.mock('@sanity/codegen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/codegen')>()
  return {...actual, runTypegenGenerate, runTypegenWatcher}
})

const {TypegenGenerateCommand} = await import('../generate.js')

const baseResult = {
  code: 'export type X = 1',
  duration: 5,
  emptyUnionTypeNodesGenerated: 0,
  filesWithErrors: 0,
  outputSize: 10,
  queriesCount: 1,
  queryFilesCount: 1,
  schemaTypesCount: 1,
  typeNodesGenerated: 1,
  unknownTypeNodesGenerated: 0,
  unknownTypeNodesRatio: 0,
}

const defaultMocks = {
  cliConfig: {typegen: {generates: './sanity.types.ts'}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
}

/**
 * Polls until the command under test has registered a `SIGINT` listener, so the
 * watch-mode test can trigger it deterministically instead of relying on a fixed
 * sleep or emitting a real OS signal (which risks tripping other process-wide
 * signal handling in the test runner).
 */
async function waitForSigintListener(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (process.listenerCount('SIGINT') > 0) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for the command to register a SIGINT listener')
}

describe('#typegen:generate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('runs a single generation using CLI config and wires up onProgress', async () => {
    runTypegenGenerate.mockResolvedValue(baseResult)

    const {error} = await testCommand(TypegenGenerateCommand, [], {mocks: defaultMocks})
    if (error) throw error

    expect(runTypegenGenerate).toHaveBeenCalledOnce()
    const [options] = runTypegenGenerate.mock.calls[0]
    if (!options.config) throw new Error('Expected a config to be passed to runTypegenGenerate')
    expect(options.workDir).toBe('/test/path')
    expect(typeof options.onProgress).toBe('function')
    expect(options.config.generates).toBe('./sanity.types.ts')
  })

  test('falls back to CLI config defaults when no typegen config is set', async () => {
    runTypegenGenerate.mockResolvedValue(baseResult)

    const {error} = await testCommand(TypegenGenerateCommand, [], {
      mocks: {...defaultMocks, cliConfig: {}},
    })
    if (error) throw error

    expect(runTypegenGenerate).toHaveBeenCalledOnce()
    const [options] = runTypegenGenerate.mock.calls[0]
    if (!options.config) throw new Error('Expected a config to be passed to runTypegenGenerate')
    expect(options.config.generates).toBe('./sanity.types.ts')
    expect(options.config.schema).toBe('./schema.json')
  })

  test('surfaces generation errors as a command error with exit 1', async () => {
    runTypegenGenerate.mockRejectedValue(new Error('schema.json not found'))

    const {error} = await testCommand(TypegenGenerateCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('schema.json not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails fast when --config-path is provided but the file does not exist', async () => {
    const {error} = await testCommand(
      TypegenGenerateCommand,
      ['--config-path', './does-not-exist.json'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Typegen config file not found: ./does-not-exist.json')
    expect(error?.oclif?.exit).toBe(1)
    expect(runTypegenGenerate).not.toHaveBeenCalled()
  })

  test('uses the watcher when --watch is passed and stops once on SIGINT', async () => {
    const stop = vi.fn().mockResolvedValue(undefined)
    runTypegenWatcher.mockReturnValue({
      getStats: () => ({
        averageGenerationDuration: 5,
        generationFailedCount: 0,
        generationSuccessfulCount: 1,
        watcherDuration: 10,
      }),
      stop,
      watcher: {},
    })

    const promise = testCommand(TypegenGenerateCommand, ['--watch'], {mocks: defaultMocks})

    await waitForSigintListener()
    const sigintListener = process.listeners('SIGINT').at(-1)
    if (!sigintListener) throw new Error('Expected a SIGINT listener to be registered')
    // Trigger the command's own registered handler directly, deterministically,
    // rather than emitting a real SIGINT (which could interact with other
    // process-wide signal handling in the test runner).
    sigintListener('SIGINT')

    const {error} = await promise
    if (error) throw error

    expect(runTypegenWatcher).toHaveBeenCalledOnce()
    const [options] = runTypegenWatcher.mock.calls[0]
    expect(options.workDir).toBe('/test/path')
    expect(stop).toHaveBeenCalledOnce()
    expect(process.listenerCount('SIGINT')).toBe(0)
    expect(process.listenerCount('SIGTERM')).toBe(0)
  })

  test('surfaces watcher setup errors as a command error with exit 1', async () => {
    runTypegenWatcher.mockImplementation(() => {
      throw new Error('failed to start watcher')
    })

    const {error} = await testCommand(TypegenGenerateCommand, ['--watch'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('failed to start watcher')
    expect(error?.oclif?.exit).toBe(1)
  })
})
