import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {convertToSystemPath, testCommand} from '@sanity/cli-test'
import {type GroqDeclaration, GroqFileDiagnosticCode} from '@sanity/codegen'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {toForwardSlashes} from '../../../util/toForwardSlashes.js'

const runTypegenGenerate = vi.hoisted(() =>
  vi.fn<typeof import('@sanity/codegen').runTypegenGenerate>(),
)

const generateGroqDeclarations = vi.hoisted(() =>
  vi.fn<typeof import('@sanity/codegen').generateGroqDeclarations>(),
)

/**
 * Minimal structural shape of `runTypegenWatcher`'s return value, covering only
 * what `TypegenGenerateCommand` actually reads (`getStats()`, `stop()`,
 * `watcher.add()` and `watcher.unwatch()`).
 *
 * Not typed against `typeof runTypegenWatcher`: its real return type includes a
 * chokidar `FSWatcher`, but two different chokidar major versions are present in
 * this workspace's dependency graph (see pnpm-lock.yaml), so a literal `FSWatcher`
 * instance built here doesn't structurally match the one in \@sanity/codegen's
 * compiled types. Naming only `add` keeps this mock honest without needing that
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
  watcher: {
    add: (paths: string | string[]) => unknown
    unwatch: (paths: string | string[]) => unknown
  }
}

const runTypegenWatcher = vi.hoisted(() =>
  vi.fn<(options: import('@sanity/codegen').RunTypegenOptions) => FakeTypegenWatcher>(),
)

vi.mock('@sanity/codegen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/codegen')>()
  return {...actual, generateGroqDeclarations, runTypegenGenerate, runTypegenWatcher}
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

const watchResourceTypes = vi.hoisted(() =>
  vi.fn<typeof import('../../../actions/typegen/watchResourceTypes.js').watchResourceTypes>(),
)

vi.mock(import('../../../actions/typegen/watchResourceTypes.js'), () => ({watchResourceTypes}))

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

const workDir = convertToSystemPath('/test/path')

/** The `.groq` files in the folders the default query patterns read from. */
const defaultGroqPatterns = ['src/**/*.groq', 'app/**/*.groq', 'sanity/**/*.groq']

/** The declarations written for two `.groq` files, one of which has a problem. */
const groqDeclarations: GroqDeclaration[] = [
  {
    declaration: join(workDir, 'src', 'broken.d.groq.ts'),
    diagnostics: [
      {
        code: GroqFileDiagnosticCode.SyntaxError,
        length: 1,
        messageText: 'Syntax error in GROQ query at position 19: Unexpected end of query',
        start: 19,
      },
    ],
    file: join(workDir, 'src', 'broken.groq'),
    written: true,
  },
  {
    declaration: join(workDir, 'src', 'posts.d.groq.ts'),
    diagnostics: [],
    file: join(workDir, 'src', 'posts.groq'),
    written: false,
  },
]

function fakeTypegenWatcher(stop: () => Promise<void>): FakeTypegenWatcher {
  return {
    getStats: () => ({
      averageGenerationDuration: 5,
      generationFailedCount: 0,
      generationSuccessfulCount: 1,
      watcherDuration: 10,
    }),
    stop,
    watcher: {add: vi.fn(), unwatch: vi.fn()},
  }
}

/** Resolves once the callbacks a watcher calls have run their asynchronous work. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
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
  beforeEach(() => {
    generateGroqDeclarations.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('runs a single generation using CLI config and wires up onProgress', async () => {
    runTypegenGenerate.mockResolvedValue(baseResult)

    const {error, stderr} = await testCommand(TypegenGenerateCommand, [], {mocks: defaultMocks})
    if (error) throw error

    expect(runTypegenGenerate).toHaveBeenCalledOnce()
    const [options] = runTypegenGenerate.mock.calls[0]
    if (!options.config) throw new Error('Expected a config to be passed to runTypegenGenerate')
    expect(options.workDir).toBe(convertToSystemPath('/test/path'))
    expect(typeof options.onProgress).toBe('function')
    expect(options.config.generates).toBe('./sanity.types.ts')

    // The `.groq` files in the query folders are typed against the same schema, afterwards.
    expect(generateGroqDeclarations).toHaveBeenCalledExactlyOnceWith({
      path: defaultGroqPatterns,
      root: workDir,
      schema: './schema.json',
    })
    expect(generateGroqDeclarations.mock.invocationCallOrder[0]).toBeGreaterThan(
      runTypegenGenerate.mock.invocationCallOrder[0],
    )
    // A project without `.groq` files sees nothing about them.
    expect(stderr).not.toContain('.groq')
  })

  test('reports each .groq file with a problem, then how many were typed', async () => {
    runTypegenGenerate.mockResolvedValue(baseResult)
    generateGroqDeclarations.mockResolvedValue(groqDeclarations)

    const {error, stderr} = await testCommand(TypegenGenerateCommand, [], {mocks: defaultMocks})
    if (error) throw error

    expect(stderr).toContain(
      'src/broken.groq: Syntax error in GROQ query at position 19: Unexpected end of query',
    )
    expect(stderr).toContain('Generated declarations for 2 .groq files')
  })

  test('surfaces a .groq declaration failure as a command error with exit 1', async () => {
    runTypegenGenerate.mockResolvedValue(baseResult)
    generateGroqDeclarations.mockRejectedValue(
      new Error(
        'No schema file at /test/path/schema.json. Run "sanity schema extract" to create it.',
      ),
    )

    const {error} = await testCommand(TypegenGenerateCommand, [], {mocks: defaultMocks})

    expect(error?.message).toContain('No schema file at /test/path/schema.json')
    expect(error?.oclif?.exit).toBe(1)
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
    const typegenWatcher = fakeTypegenWatcher(stop)
    runTypegenWatcher.mockReturnValue(typegenWatcher)

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
    // Editing a `.groq` file generates as well. Writing its declaration does not.
    expect(typegenWatcher.watcher.add).toHaveBeenCalledExactlyOnceWith(
      defaultGroqPatterns.map((pattern) => toForwardSlashes(join(workDir, pattern))),
    )
    expect(typegenWatcher.watcher.unwatch).toHaveBeenCalledExactlyOnceWith(
      toForwardSlashes(join(workDir, '**/*.d.groq.ts')),
    )
    expect(stop).toHaveBeenCalledOnce()
    expect(process.listenerCount('SIGINT')).toBe(0)
    expect(process.listenerCount('SIGTERM')).toBe(0)
  })

  test('with --watch, types the .groq files after each generation', async () => {
    runTypegenWatcher.mockReturnValue(fakeTypegenWatcher(vi.fn().mockResolvedValue(undefined)))
    generateGroqDeclarations
      .mockResolvedValueOnce(groqDeclarations)
      .mockRejectedValueOnce(new Error('No schema file at /test/path/schema.json.'))

    const promise = testCommand(TypegenGenerateCommand, ['--watch'], {mocks: defaultMocks})

    await waitForSigintListener()
    const [options] = runTypegenWatcher.mock.calls[0]
    options.onProgress?.({type: 'schemaLoaded'})
    expect(generateGroqDeclarations).not.toHaveBeenCalled()
    options.onProgress?.({result: baseResult, type: 'complete'})
    await settle()
    options.onProgress?.({result: baseResult, type: 'complete'})
    await settle()

    const sigintListener = process.listeners('SIGINT').at(-1)
    if (!sigintListener) throw new Error('Expected a SIGINT listener to be registered')
    sigintListener('SIGINT')

    const {error, stderr} = await promise
    if (error) throw error

    expect(generateGroqDeclarations).toHaveBeenCalledTimes(2)
    expect(generateGroqDeclarations).toHaveBeenCalledWith({
      path: defaultGroqPatterns,
      root: workDir,
      schema: './schema.json',
    })
    expect(stderr).toContain('src/broken.groq: Syntax error in GROQ query')
    expect(stderr).toContain('Generated declarations for 2 .groq files')
    // A failure is reported, and the watcher keeps running.
    expect(stderr).toContain('No schema file at /test/path/schema.json.')
  })

  test('still completes on SIGINT when the watcher fails to stop', async () => {
    const stop = vi.fn().mockRejectedValue(new Error('watcher close failed'))
    runTypegenWatcher.mockReturnValue(fakeTypegenWatcher(stop))

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
    const remote = {
      dataset: 'production',
      generates: './production.ts',
      path: './src/production/*.ts',
      projectId: 'abc123',
    }
    const local = {
      dataset: 'staging',
      generates: './staging.ts',
      path: './src/staging/*.ts',
      projectId: 'abc123',
      schema: './schema.staging.json',
    }
    /** What types the `.groq` files: staging's, in its folder. Production's schema is fetched. */
    const resourceGroqDeclarations = {
      path: ['src/staging/**/*.groq'],
      resources: [{path: ['src/staging'], schema: './schema.staging.json'}],
      root: workDir,
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
      expect(resolveOptions.checkSchemaFiles).toBe(true)

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

      // Then each resource with a schema file types the `.groq` files in its own folders.
      expect(generateGroqDeclarations).toHaveBeenCalledExactlyOnceWith(resourceGroqDeclarations)
      expect(generateGroqDeclarations.mock.invocationCallOrder[0]).toBeGreaterThan(
        generateResourceTypes.mock.invocationCallOrder[0],
      )
      expect(stderr).not.toContain('.groq')
    })

    test('reports the .groq files typed, and those a fetched schema leaves untyped', async () => {
      // A real directory, because the command looks for the `.groq` files it leaves untyped.
      const directory = mkdtempSync(join(tmpdir(), 'typegen-generate-'))
      mkdirSync(join(directory, 'src', 'production'), {recursive: true})
      writeFileSync(join(directory, 'src', 'production', 'authors.groq'), '*[_type == "author"]')
      mockResolution()
      generateResourceTypes.mockResolvedValue([])
      generateGroqDeclarations.mockResolvedValue([groqDeclarations[1]])

      try {
        const {error, stderr} = await testCommand(TypegenGenerateCommand, [], {
          mocks: {...resourceMocks, projectRoot: {...defaultMocks.projectRoot, directory}},
        })
        if (error) throw error

        expect(generateGroqDeclarations).toHaveBeenCalledExactlyOnceWith({
          ...resourceGroqDeclarations,
          root: directory,
        })
        // oclif wraps warnings, so each fragment fits on one line.
        expect(stderr).toContain('No declarations for the 1 .groq file under "src/production"')
        expect(stderr).toContain('uses the schema bound to its dataset')
        expect(stderr).toContain('Generated declarations for 1 .groq file')
      } finally {
        rmSync(directory, {force: true, recursive: true})
      }
    })

    test('types no .groq files when every schema is fetched', async () => {
      resolveResourceSchemas.mockResolvedValue([resolved[0]])
      generateResourceTypes.mockResolvedValue([])

      const {error} = await testCommand(TypegenGenerateCommand, [], {
        mocks: {...defaultMocks, cliConfig: {typegen: {resources: [remote]}}},
      })
      if (error) throw error

      expect(generateResourceTypes).toHaveBeenCalledOnce()
      expect(generateGroqDeclarations).not.toHaveBeenCalled()
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

    test('with --watch, resolves every schema once, then watches the resources', async () => {
      mockResolution()
      const stop = vi.fn().mockResolvedValue(undefined)
      watchResourceTypes.mockReturnValue({
        getStats: () => ({
          averageGenerationDuration: 5,
          generationFailedCount: 0,
          generationSuccessfulCount: 1,
          watcherDuration: 10,
        }),
        stop,
      })

      const promise = testCommand(TypegenGenerateCommand, ['--watch'], {mocks: resourceMocks})

      await waitForSigintListener()
      const [options] = watchResourceTypes.mock.calls[0]
      options.onChange?.('change', 'src/queries.ts')
      options.onError?.(new Error('Failed to generate types for "abc123.staging"'))
      options.onGroqDeclarations?.(groqDeclarations)

      const sigintListener = process.listeners('SIGINT').at(-1)
      if (!sigintListener) throw new Error('Expected a SIGINT listener to be registered')
      sigintListener('SIGINT')

      const {error, stderr, stdout} = await promise
      if (error) throw error

      expect(resolveResourceSchemas).toHaveBeenCalledOnce()
      // A missing local schema file is reported on each run until it appears.
      expect(resolveResourceSchemas.mock.calls[0][0].checkSchemaFiles).toBe(false)
      expect(watchResourceTypes).toHaveBeenCalledOnce()
      expect(options.resolved).toBe(resolved)
      expect(options.workDir).toBe(convertToSystemPath('/test/path'))
      expect(options.config.overloadClientMethods).toBe(false)
      expect(typeof options.onProgress?.(resolved[0])).toBe('function')
      expect(options.groqDeclarations).toEqual(resourceGroqDeclarations)

      // The watcher generates; the command does not generate on its own.
      expect(generateResourceTypes).not.toHaveBeenCalled()
      expect(generateGroqDeclarations).not.toHaveBeenCalled()
      expect(runTypegenWatcher).not.toHaveBeenCalled()

      expect(stderr).toContain('Fetched the schema bound to abc123.production (uEiB-version)')
      expect(stdout).toContain('change: src/queries.ts')
      expect(stderr).toContain('Failed to generate types for "abc123.staging"')
      expect(stderr).toContain('src/broken.groq: Syntax error in GROQ query')
      expect(stderr).toContain('Generated declarations for 2 .groq files')
      expect(stop).toHaveBeenCalledOnce()
      expect(process.listenerCount('SIGINT')).toBe(0)
      expect(process.listenerCount('SIGTERM')).toBe(0)
    })

    test('with --watch, exits 1 when a schema cannot be located', async () => {
      resolveResourceSchemas.mockRejectedValue(
        new Error('Failed to get the schema for "abc123.production": No schema is bound'),
      )

      const {error} = await testCommand(TypegenGenerateCommand, ['--watch'], {
        mocks: resourceMocks,
      })

      expect(error?.message).toContain('Failed to get the schema for "abc123.production"')
      expect(error?.oclif?.exit).toBe(1)
      expect(watchResourceTypes).not.toHaveBeenCalled()
      expect(process.listenerCount('SIGINT')).toBe(0)
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
