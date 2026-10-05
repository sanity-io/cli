import {convertToSystemPath, testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

const runTypegenGenerate = vi.hoisted(() =>
  vi.fn<typeof import('@sanity/codegen').runTypegenGenerate>(),
)

/**
 * Minimal structural shape of `runTypegenWatcher`'s return value, covering only
 * what `TypegenGenerateCommand` actually reads (`getStats()` and `stop()`).
 *
 * Not typed against `typeof runTypegenWatcher`: its real return type includes a
 * chokidar `FSWatcher`, but two different chokidar major versions are present in
 * this workspace's dependency graph (see pnpm-lock.yaml), so a literal `FSWatcher`
 * instance built here doesn't structurally match the one in \@sanity/codegen's
 * compiled types. `watcher: unknown` keeps this mock honest without needing that
 * type or a type assertion.
 */
interface FakeTypegenWatcher {
  getStats: () => {
    averageGenerationDuration: number
    generationFailedCount: number
    generationSuccessfulCount: number
    watcherDuration: number
  }
  stop: () => Promise<void>
  watcher: unknown
}

const runTypegenWatcher = vi.hoisted(() =>
  vi.fn<(options: import('@sanity/codegen').RunTypegenOptions) => FakeTypegenWatcher>(),
)

vi.mock('@sanity/codegen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/codegen')>()
  return {...actual, runTypegenGenerate, runTypegenWatcher}
})

const generateResourceTypes = vi.hoisted(() =>
  vi.fn<typeof import('../../../actions/typegen/generateResourceTypes.js').generateResourceTypes>(),
)
const resolveResourceSchemas = vi.hoisted(() =>
  vi.fn<
    typeof import('../../../actions/typegen/generateResourceTypes.js').resolveResourceSchemas
  >(),
)

vi.mock(import('../../../actions/typegen/generateResourceTypes.js'), () => ({
  generateResourceTypes,
  resolveResourceSchemas,
}))

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
    expect(options.workDir).toBe(convertToSystemPath('/test/path'))
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
    // The specific config error must not be re-wrapped by the outer catch.
    expect(error?.message).not.toContain('An error occurred during config loading')
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
    expect(options.workDir).toBe(convertToSystemPath('/test/path'))
    expect(typeof options.onProgress).toBe('function')
    expect(stop).toHaveBeenCalledOnce()
    expect(process.listenerCount('SIGINT')).toBe(0)
    expect(process.listenerCount('SIGTERM')).toBe(0)
  })

  test('still completes on SIGINT when the watcher fails to stop', async () => {
    const stop = vi.fn().mockRejectedValue(new Error('watcher close failed'))
    runTypegenWatcher.mockReturnValue({
      getStats: () => ({
        averageGenerationDuration: 0,
        generationFailedCount: 0,
        generationSuccessfulCount: 0,
        watcherDuration: 0,
      }),
      stop,
      watcher: {},
    })

    const promise = testCommand(TypegenGenerateCommand, ['--watch'], {mocks: defaultMocks})

    await waitForSigintListener()
    const sigintListener = process.listeners('SIGINT').at(-1)
    if (!sigintListener) throw new Error('Expected a SIGINT listener to be registered')
    sigintListener('SIGINT')

    // A rejecting stop() must not hang the command or leak the rejection.
    const {error} = await promise
    if (error) throw error

    expect(stop).toHaveBeenCalledOnce()
    expect(process.listenerCount('SIGINT')).toBe(0)
    expect(process.listenerCount('SIGTERM')).toBe(0)
  })

  describe('with typegen.resources', () => {
    const remote = {dataset: 'production', generates: './production.ts', projectId: 'abc123'}
    const local = {
      dataset: 'staging',
      generates: './staging.ts',
      projectId: 'abc123',
      schema: './schema.staging.json',
    }
    const resolved = [
      {key: 'abc123.production', resource: remote, schema: [], schemaVersion: 'uEiB-version'},
      {key: 'abc123.staging', resource: local, schemaPath: './schema.staging.json'},
    ]
    const resourceMocks = {
      ...defaultMocks,
      cliConfig: {typegen: {resources: [remote, local]}},
    }

    function mockResolution() {
      resolveResourceSchemas.mockImplementation(async ({onResolved, onResolving, resources}) => {
        for (const [index, resource] of resources.entries()) {
          onResolving?.(resource, resolved[index].key)
          onResolved?.(resolved[index])
        }
        return resolved
      })
    }

    test('resolves every schema, then generates each resource', async () => {
      mockResolution()
      generateResourceTypes.mockResolvedValue([
        {key: 'abc123.production', result: baseResult},
        {key: 'abc123.staging', result: baseResult},
      ])

      const {error, stderr} = await testCommand(TypegenGenerateCommand, [], {mocks: resourceMocks})
      if (error) throw error

      expect(resolveResourceSchemas).toHaveBeenCalledOnce()
      const [resolveOptions] = resolveResourceSchemas.mock.calls[0]
      expect(resolveOptions.resources).toEqual([remote, local])
      expect(resolveOptions.workDir).toBe(convertToSystemPath('/test/path'))

      expect(generateResourceTypes).toHaveBeenCalledOnce()
      const [generateOptions] = generateResourceTypes.mock.calls[0]
      expect(generateOptions.resolved).toBe(resolved)
      expect(generateOptions.workDir).toBe(convertToSystemPath('/test/path'))
      expect(generateOptions.config.overloadClientMethods).toBe(false)
      expect(typeof generateOptions.onProgress?.(resolved[0])).toBe('function')
      expect(typeof generateOptions.onProgress?.(resolved[1])).toBe('function')

      expect(runTypegenGenerate).not.toHaveBeenCalled()
      expect(stderr).toContain('Fetched the schema bound to abc123.production (uEiB-version)')
      expect(stderr).toContain('Using ./schema.staging.json for abc123.staging')
    })

    test('prints configuration warnings', async () => {
      mockResolution()
      generateResourceTypes.mockResolvedValue([])

      const {error, stderr} = await testCommand(TypegenGenerateCommand, [], {
        mocks: {
          ...defaultMocks,
          cliConfig: {typegen: {overloadClientMethods: true, resources: [remote, local]}},
        },
      })
      if (error) throw error

      expect(stderr).toContain('TS2717')
    })

    test('reports an invalid resource as a config error', async () => {
      const {error} = await testCommand(TypegenGenerateCommand, [], {
        mocks: {...defaultMocks, cliConfig: {typegen: {resources: [{...remote, dataset: ''}]}}},
      })

      expect(error?.message).toContain('resources.0.dataset: Must not be empty')
      expect(error?.oclif?.exit).toBe(1)
      expect(resolveResourceSchemas).not.toHaveBeenCalled()
    })

    test('surfaces a failed resource as a command error with exit 1', async () => {
      resolveResourceSchemas.mockRejectedValue(
        new Error('Failed to get the schema for "abc123.production": No schema is bound'),
      )

      const {error} = await testCommand(TypegenGenerateCommand, [], {mocks: resourceMocks})

      expect(error?.message).toContain('Failed to get the schema for "abc123.production"')
      expect(error?.oclif?.exit).toBe(1)
      expect(generateResourceTypes).not.toHaveBeenCalled()
    })

    test('rejects --watch as a usage error', async () => {
      const {error} = await testCommand(TypegenGenerateCommand, ['--watch'], {
        mocks: resourceMocks,
      })

      expect(error?.message).toContain('Watch mode does not support typegen.resources yet')
      expect(error?.oclif?.exit).toBe(2)
      expect(runTypegenWatcher).not.toHaveBeenCalled()
    })
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
