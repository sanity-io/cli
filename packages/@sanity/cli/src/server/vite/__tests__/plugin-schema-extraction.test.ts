import path from 'node:path'

import {CLITelemetryStore} from '@sanity/cli-core'
import {SchemaValidationProblemGroup} from 'sanity'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {SchemaExtractionError} from '../../../actions/schema/utils/SchemaExtractionError.js'
import {sanitySchemaExtractionPlugin} from '../plugin-schema-extraction'

const mockRunSchemaExtraction = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/schema/runSchemaExtraction.js', () => ({
  runSchemaExtraction: mockRunSchemaExtraction,
}))

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

const TEST_PROJECT_DIR = path.resolve('/project')

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

describe('sanitySchemaExtractionPlugin', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockRunSchemaExtraction.mockReset()
    mockRunSchemaExtraction.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('runs initial extraction when httpServer emits listening event', async () => {
    const plugin = sanitySchemaExtractionPlugin({
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

    // No extraction yet
    expect(mockRunSchemaExtraction).not.toHaveBeenCalled()

    // Simulate server starting
    httpServer.emit('listening')

    // Still not called - waiting for initial delay (1000ms)
    expect(mockRunSchemaExtraction).not.toHaveBeenCalled()

    // Advance past initial extraction delay
    await vi.advanceTimersByTimeAsync(1000)

    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(1)
    expect(output.info).toHaveBeenCalledWith(
      expect.anything(),
      'Schema extraction enabled. Watching:',
    )
  })

  it('extracts schema when a matching file changes', async () => {
    const plugin = sanitySchemaExtractionPlugin({
      debounceMs: 100,
      enforceRequiredFields: true,
      output: {error: vi.fn(), info: vi.fn(), log: vi.fn()},
      workDir: TEST_PROJECT_DIR,
    })

    // Simulate Vite's configResolved hook
    const configResolved = plugin.configResolved as (config: {root: string}) => void
    configResolved({root: TEST_PROJECT_DIR})

    // Create a fake watcher and server, then call configureServer hook
    const watcher = createMockWatcher()
    const configureServer = plugin.configureServer as unknown as (server: {
      httpServer: null
      watcher: typeof watcher
    }) => void
    configureServer({httpServer: null, watcher})

    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(0)

    // Trigger three rapid changes on a schema file
    watcher.emit('change', path.join(TEST_PROJECT_DIR, 'schemaTypes', 'post.ts'))
    watcher.emit('change', path.join(TEST_PROJECT_DIR, 'schemaTypes', 'page.ts'))
    watcher.emit('change', path.join(TEST_PROJECT_DIR, 'schemaTypes', 'author.ts'))

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(100)
    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(1)

    // Called with correct params in object
    expect(mockRunSchemaExtraction).toHaveBeenCalledWith({
      configPath: path.join(TEST_PROJECT_DIR, 'sanity.config.ts'),
      enforceRequiredFields: true,
      format: 'groq-type-nodes',
      outputPath: path.join(TEST_PROJECT_DIR, 'schema.json'),
      watchPatterns: [],
      workspace: undefined,
    })

    // Trigger another change
    watcher.emit('change', path.join(TEST_PROJECT_DIR, 'schemaTypes', 'author.ts'))
    await vi.advanceTimersByTimeAsync(100)
    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(2)

    // Trigger a change event unrelated to the watching
    watcher.emit('change', path.join('/src', 'component', 'Foobar', 'index.tsx'))
    await vi.advanceTimersByTimeAsync(100)
    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(2)
  })

  it('logs error and validation messages when extraction fails', async () => {
    const plugin = sanitySchemaExtractionPlugin({
      debounceMs: 100,
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

    // Make extraction fail with validation errors
    const validationErrors = [
      {path: ['document', 'title'], problems: [{message: 'Title is required'}]},
    ]
    mockRunSchemaExtraction.mockRejectedValueOnce(
      new SchemaExtractionError(
        'Schema validation failed',
        validationErrors as unknown as SchemaValidationProblemGroup[],
      ),
    )

    // Trigger extraction
    watcher.emit('change', path.join(TEST_PROJECT_DIR, 'schemaTypes', 'post.ts'))
    await vi.advanceTimersByTimeAsync(100)

    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(1)
    expect(output.log).toHaveBeenCalledWith(
      expect.anything(),
      'Extraction failed: Schema validation failed',
    )
  })

  it('extracts schema during build via buildEnd hook', async () => {
    // Use real timers for this test - no debouncing involved
    vi.useRealTimers()

    // Mock returns a schema array for buildEnd to process
    mockRunSchemaExtraction.mockResolvedValueOnce([
      {name: 'post', type: 'document'},
      {name: 'author', type: 'document'},
      {name: 'category', type: 'type'},
    ])

    const plugin = sanitySchemaExtractionPlugin({
      outputPath: path.join(TEST_PROJECT_DIR, 'dist', 'schema.json'),
      telemetryLogger: telemetryLogger,
      workDir: TEST_PROJECT_DIR,
    })

    const configResolved = plugin.configResolved as (config: {root: string}) => void
    configResolved({root: TEST_PROJECT_DIR})

    const buildEnd = plugin.buildEnd as () => Promise<void>
    await buildEnd()

    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(1)
    expect(mockRunSchemaExtraction).toHaveBeenCalledWith({
      configPath: path.join(TEST_PROJECT_DIR, 'sanity.config.ts'),
      enforceRequiredFields: false,
      format: 'groq-type-nodes',
      outputPath: path.join(TEST_PROJECT_DIR, 'dist', 'schema.json'),
      watchPatterns: [],
      workspace: undefined,
    })

    // Verify telemetry was called with schema stats
    expect(traceMock.start).toHaveBeenCalled()
    expect(traceMock.log).toHaveBeenCalledWith({
      enforceRequiredFields: false,
      schemaAllTypesCount: 3,
      schemaDocumentTypesCount: 2,
      schemaFormat: 'groq-type-nodes',
      schemaTypesCount: 1,
    })
  })

  it('calls telemetry logger during watch mode', async () => {
    const plugin = sanitySchemaExtractionPlugin({
      enforceRequiredFields: true,
      output: {error: vi.fn(), info: vi.fn(), log: vi.fn()},
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
      enforceRequiredFields: true,
      schemaFormat: 'groq-type-nodes',
      step: 'started',
    })
  })
})
