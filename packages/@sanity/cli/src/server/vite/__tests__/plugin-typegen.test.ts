import path from 'node:path'

import {CLITelemetryStore} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {sanityTypegenPlugin} from '../plugin-typegen.js'

function createMockWatcher() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  return {
    add: vi.fn(),
    emit(event: string, ...args: unknown[]) {
      const eventListeners = listeners.get(event) || []
      for (const listener of eventListeners) {
        listener(...args)
      }
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners.has(event)) {
        listeners.set(event, [])
      }
      listeners.get(event)!.push(listener)
    },
  }
}

function createMockHttpServer() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  return {
    emit(event: string, ...args: unknown[]) {
      const eventListeners = listeners.get(event) || []
      for (const listener of eventListeners) {
        listener(...args)
      }
    },
    once(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners.has(event)) {
        listeners.set(event, [])
      }
      listeners.get(event)!.push(listener)
    },
  }
}

const TEST_PROJECT_DIR = path.resolve('/project')

const output = {error: vi.fn(), info: vi.fn(), log: vi.fn()}

const traceMock = {
  complete: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  start: vi.fn(),
}
const telemetryLogger = {
  trace: vi.fn().mockReturnValue(traceMock),
} as unknown as CLITelemetryStore

// Mock the @sanity/codegen module
vi.mock('@sanity/codegen', async (importOriginal) => ({
  ...(await importOriginal()),
  runTypegenGenerate: vi.fn().mockResolvedValue({
    code: '',
    emptyUnionTypeNodesGenerated: 0,
    filesWithErrors: 0,
    queriesCount: 5,
    queryFilesCount: 3,
    schemaTypesCount: 10,
    typeNodesGenerated: 15,
    unknownTypeNodesGenerated: 0,
  }),
}))

// Mock fs.existsSync
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal()),
  existsSync: vi.fn().mockReturnValue(true),
}))

describe('sanityTypegenPlugin', () => {
  let runTypegenGenerate: ReturnType<typeof vi.fn>
  let existsSync: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.useFakeTimers()
    const codegenModule = await import('@sanity/codegen')
    runTypegenGenerate = vi.mocked(codegenModule.runTypegenGenerate)
    runTypegenGenerate.mockReset()
    runTypegenGenerate.mockResolvedValue({
      code: '',
      emptyUnionTypeNodesGenerated: 0,
      filesWithErrors: 0,
      queriesCount: 5,
      queryFilesCount: 3,
      schemaTypesCount: 10,
      typeNodesGenerated: 15,
      unknownTypeNodesGenerated: 0,
    })

    const fsModule = await import('node:fs')
    existsSync = vi.mocked(fsModule.existsSync)
    existsSync.mockReset()
    existsSync.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('runs initial generation when httpServer emits listening event', async () => {
    const plugin = sanityTypegenPlugin({
      config: {},
      output,
      workDir: TEST_PROJECT_DIR,
    })

    const configResolved = plugin.configResolved as (config: {root: string}) => void
    configResolved({root: TEST_PROJECT_DIR})

    const watcher = createMockWatcher()
    const httpServer = createMockHttpServer()

    const configureServer = plugin.configureServer as unknown as (server: {
      httpServer: typeof httpServer
      watcher: typeof watcher
    }) => void
    configureServer({httpServer, watcher})

    // No generation yet
    expect(runTypegenGenerate).not.toHaveBeenCalled()

    // Simulate server starting
    httpServer.emit('listening')

    // Still not called - waiting for initial delay (1000ms)
    expect(runTypegenGenerate).not.toHaveBeenCalled()

    // Advance past initial generation delay
    await vi.advanceTimersByTimeAsync(1000)

    expect(runTypegenGenerate).toHaveBeenCalledTimes(1)
    expect(output.info).toHaveBeenCalledWith(expect.anything(), 'Typegen enabled. Watching:')
  })

  it('generates types when a matching query file changes', async () => {
    const plugin = sanityTypegenPlugin({
      config: {
        path: ['./src/**/*.ts'],
      },
      output,
      workDir: TEST_PROJECT_DIR,
    })

    const configResolved = plugin.configResolved as (config: {root: string}) => void
    configResolved({root: TEST_PROJECT_DIR})

    const watcher = createMockWatcher()
    const configureServer = plugin.configureServer as unknown as (server: {
      httpServer: null
      watcher: typeof watcher
    }) => void
    configureServer({httpServer: null, watcher})

    expect(runTypegenGenerate).toHaveBeenCalledTimes(0)

    // Trigger change on a query file
    watcher.emit('change', path.join('src', 'queries', 'posts.ts'))

    // Advance past debounce (1000ms default)
    await vi.advanceTimersByTimeAsync(1000)
    // Both initial generation (1000ms delay) and debounced change fire together
    expect(runTypegenGenerate).toHaveBeenCalledTimes(2)

    // Trigger another change
    watcher.emit('change', path.join('src', 'queries', 'authors.ts'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(runTypegenGenerate).toHaveBeenCalledTimes(3)

    // Trigger a change event unrelated to the watching patterns
    watcher.emit('change', path.join('/other', 'path', 'file.ts'))
    await vi.advanceTimersByTimeAsync(1000)
    // Should still be 3 since the file doesn't match the pattern
    expect(runTypegenGenerate).toHaveBeenCalledTimes(3)
  })

  it('generates types when schema.json changes', async () => {
    const plugin = sanityTypegenPlugin({
      config: {
        schema: 'schema.json',
      },
      output,
      workDir: TEST_PROJECT_DIR,
    })

    const configResolved = plugin.configResolved as (config: {root: string}) => void
    configResolved({root: TEST_PROJECT_DIR})

    const watcher = createMockWatcher()
    const configureServer = plugin.configureServer as unknown as (server: {
      httpServer: null
      watcher: typeof watcher
    }) => void
    configureServer({httpServer: null, watcher})

    expect(runTypegenGenerate).toHaveBeenCalledTimes(0)

    // Trigger change on schema.json (using absolute path as watcher would)
    watcher.emit('change', path.join(TEST_PROJECT_DIR, 'schema.json'))

    // Advance past debounce (1000ms) - both initial and debounced fire
    await vi.advanceTimersByTimeAsync(1000)
    expect(runTypegenGenerate).toHaveBeenCalledTimes(2)
  })

  it('logs error when schema.json does not exist', async () => {
    existsSync.mockReturnValue(false)

    const plugin = sanityTypegenPlugin({
      config: {},
      output,
      workDir: TEST_PROJECT_DIR,
    })

    const configResolved = plugin.configResolved as (config: {root: string}) => void
    configResolved({root: TEST_PROJECT_DIR})

    const watcher = createMockWatcher()
    const configureServer = plugin.configureServer as unknown as (server: {
      httpServer: null
      watcher: typeof watcher
    }) => void
    configureServer({httpServer: null, watcher})

    // Trigger change
    watcher.emit('change', path.join('src', 'queries', 'posts.ts'))
    await vi.advanceTimersByTimeAsync(1000)

    // Should not call runTypegenGenerate since schema doesn't exist
    expect(runTypegenGenerate).not.toHaveBeenCalled()

    // Should log error about missing schema
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('Schema file not found'))
  })

  it('logs warning when generation has errors', async () => {
    // Mock both calls to return errors (initial + debounced)
    const errorResult = {
      code: '',
      emptyUnionTypeNodesGenerated: 0,
      filesWithErrors: 2,
      queriesCount: 5,
      queryFilesCount: 3,
      schemaTypesCount: 10,
      typeNodesGenerated: 15,
      unknownTypeNodesGenerated: 0,
    }
    runTypegenGenerate.mockResolvedValueOnce(errorResult)
    runTypegenGenerate.mockResolvedValueOnce(errorResult)

    const plugin = sanityTypegenPlugin({
      config: {},
      output,
      workDir: TEST_PROJECT_DIR,
    })

    const configResolved = plugin.configResolved as (config: {root: string}) => void
    configResolved({root: TEST_PROJECT_DIR})

    const watcher = createMockWatcher()
    const configureServer = plugin.configureServer as unknown as (server: {
      httpServer: null
      watcher: typeof watcher
    }) => void
    configureServer({httpServer: null, watcher})

    watcher.emit('change', path.join('src', 'queries', 'posts.ts'))
    await vi.advanceTimersByTimeAsync(1000)

    // Both initial and debounced fire at 1000ms
    expect(runTypegenGenerate).toHaveBeenCalledTimes(2)
    expect(output.log).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('with errors in 2 files'),
    )
  })

  it('generates types during build via buildEnd hook', async () => {
    vi.useRealTimers()

    const plugin = sanityTypegenPlugin({
      config: {
        generates: 'sanity.types.ts',
        path: ['./src/**/*.ts'],
        schema: 'schema.json',
      },
      output,
      workDir: TEST_PROJECT_DIR,
    })

    const configResolved = plugin.configResolved as (config: {root: string}) => void
    configResolved({root: TEST_PROJECT_DIR})

    const buildEnd = plugin.buildEnd as () => Promise<void>
    await buildEnd()

    expect(runTypegenGenerate).toHaveBeenCalledTimes(1)
    expect(runTypegenGenerate).toHaveBeenCalledWith({
      config: expect.objectContaining({
        generates: 'sanity.types.ts',
        path: ['./src/**/*.ts'],
        schema: 'schema.json',
      }),
      workDir: TEST_PROJECT_DIR,
    })
  })

  it('applies default config values', async () => {
    vi.useRealTimers()

    const plugin = sanityTypegenPlugin({
      config: {}, // Empty config - should use defaults
      output,
      workDir: TEST_PROJECT_DIR,
    })

    const configResolved = plugin.configResolved as (config: {root: string}) => void
    configResolved({root: TEST_PROJECT_DIR})

    const buildEnd = plugin.buildEnd as () => Promise<void>
    await buildEnd()

    expect(runTypegenGenerate).toHaveBeenCalledWith({
      config: expect.objectContaining({
        formatGeneratedCode: false, // default
        generates: 'sanity.types.ts', // default
        overloadClientMethods: false, // default
        schema: 'schema.json', // default
      }),
      workDir: TEST_PROJECT_DIR,
    })
  })

  it('calls telemetry logger during watch mode', async () => {
    const plugin = sanityTypegenPlugin({
      config: {},
      output,
      telemetryLogger: telemetryLogger,
      workDir: TEST_PROJECT_DIR,
    })

    const configResolved = plugin.configResolved as (config: {root: string}) => void
    configResolved({root: TEST_PROJECT_DIR})

    const watcher = createMockWatcher()
    const httpServer = createMockHttpServer()

    const configureServer = plugin.configureServer as unknown as (server: {
      httpServer: typeof httpServer
      watcher: typeof watcher
    }) => void
    configureServer({httpServer, watcher})

    // Telemetry trace should be started
    expect(telemetryLogger.trace).toHaveBeenCalled()
    expect(traceMock.start).toHaveBeenCalled()
    expect(traceMock.log).toHaveBeenCalledWith({
      step: 'started',
    })
  })

  it('debounces rapid file changes', async () => {
    const plugin = sanityTypegenPlugin({
      config: {
        path: ['./src/**/*.ts'],
      },
      output,
      workDir: TEST_PROJECT_DIR,
    })

    const configResolved = plugin.configResolved as (config: {root: string}) => void
    configResolved({root: TEST_PROJECT_DIR})

    const watcher = createMockWatcher()
    const configureServer = plugin.configureServer as unknown as (server: {
      httpServer: null
      watcher: typeof watcher
    }) => void
    configureServer({httpServer: null, watcher})

    // Trigger multiple rapid changes
    watcher.emit('change', path.join('src', 'queries', 'posts.ts'))
    watcher.emit('change', path.join('src', 'queries', 'authors.ts'))
    watcher.emit('change', path.join('src', 'queries', 'categories.ts'))

    // Advance past debounce (1000ms)
    await vi.advanceTimersByTimeAsync(1000)

    // Should generate twice: once from initial generation (1000ms delay) and once from debounced changes
    // The multiple rapid changes are debounced into a single call
    expect(runTypegenGenerate).toHaveBeenCalledTimes(2)
  })
})
