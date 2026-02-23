import path from 'node:path'

import {CLITelemetryStore} from '@sanity/cli-core'
import {SchemaValidationProblemGroup} from 'sanity'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createMockHttpServer, createMockWatcher} from '../../../../test/testUtils.js'
import {SchemaExtractionError} from '../../../actions/schema/utils/SchemaExtractionError.js'
import {sanitySchemaExtractionPlugin} from '../plugin-schema-extraction.js'

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
      configPath: path.join(TEST_PROJECT_DIR, 'sanity.config.ts'),
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

    expect(mockRunSchemaExtraction).not.toHaveBeenCalled()

    httpServer.emit('listening')

    expect(mockRunSchemaExtraction).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)

    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(1)
    expect(output.info).toHaveBeenCalledWith(
      expect.anything(),
      'Schema extraction enabled. Watching:',
    )

    watcher.emit('close')
  })

  it('extracts schema when a matching file changes', async () => {
    const plugin = sanitySchemaExtractionPlugin({
      configPath: path.join(TEST_PROJECT_DIR, 'sanity.config.ts'),
      debounceMs: 100,
      enforceRequiredFields: true,
      output: {error: vi.fn(), info: vi.fn(), log: vi.fn()},
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

    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(0)

    watcher.emit('change', path.join(TEST_PROJECT_DIR, 'schemaTypes', 'post.ts'))
    watcher.emit('change', path.join(TEST_PROJECT_DIR, 'schemaTypes', 'page.ts'))
    watcher.emit('change', path.join(TEST_PROJECT_DIR, 'schemaTypes', 'author.ts'))

    await vi.advanceTimersByTimeAsync(100)
    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(1)

    expect(mockRunSchemaExtraction).toHaveBeenCalledWith({
      configPath: path.join(TEST_PROJECT_DIR, 'sanity.config.ts'),
      enforceRequiredFields: true,
      format: 'groq-type-nodes',
      outputPath: path.join(TEST_PROJECT_DIR, 'schema.json'),
      watchPatterns: [],
      workspace: undefined,
    })

    watcher.emit('change', path.join(TEST_PROJECT_DIR, 'schemaTypes', 'author.ts'))
    await vi.advanceTimersByTimeAsync(100)
    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(2)

    watcher.emit('change', path.join('/src', 'component', 'Foobar', 'index.tsx'))
    await vi.advanceTimersByTimeAsync(100)
    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(2)

    watcher.emit('close')
  })

  it('logs error and validation messages when extraction fails', async () => {
    const plugin = sanitySchemaExtractionPlugin({
      configPath: path.join(TEST_PROJECT_DIR, 'sanity.config.ts'),
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

    const validationErrors = [
      {path: ['document', 'title'], problems: [{message: 'Title is required'}]},
    ]
    mockRunSchemaExtraction.mockRejectedValueOnce(
      new SchemaExtractionError(
        'Schema validation failed',
        validationErrors as unknown as SchemaValidationProblemGroup[],
      ),
    )

    watcher.emit('change', path.join(TEST_PROJECT_DIR, 'schemaTypes', 'post.ts'))
    await vi.advanceTimersByTimeAsync(100)

    expect(mockRunSchemaExtraction).toHaveBeenCalledTimes(1)
    expect(output.error).toHaveBeenCalledWith(
      expect.anything(),
      'Extraction failed: Schema validation failed',
    )

    watcher.emit('close')
  })

  it('extracts schema during build via buildEnd hook', async () => {
    vi.useRealTimers()

    mockRunSchemaExtraction.mockResolvedValueOnce([
      {name: 'post', type: 'document'},
      {name: 'author', type: 'document'},
      {name: 'category', type: 'type'},
    ])

    const plugin = sanitySchemaExtractionPlugin({
      configPath: path.join(TEST_PROJECT_DIR, 'sanity.config.ts'),
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
      configPath: path.join(TEST_PROJECT_DIR, 'sanity.config.ts'),
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

    expect(telemetryLogger.trace).toHaveBeenCalled()
    expect(traceMock.start).toHaveBeenCalled()
    expect(traceMock.log).toHaveBeenCalledWith({
      enforceRequiredFields: true,
      schemaFormat: 'groq-type-nodes',
      step: 'started',
    })

    watcher.emit('close')
  })
})
