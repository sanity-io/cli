import {type ChildProcess, spawn} from 'node:child_process'
import {appendFile, mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  clearCliTelemetry,
  CLI_TELEMETRY_SYMBOL,
  findProjectRoot,
  getCliConfig,
  getCliTelemetry,
  getUserConfig,
  isCi,
  normalizePath,
  reportCliTraceError,
} from '@sanity/cli-core'
import {createTestToken, mockApi, testHook} from '@sanity/cli-test'
import {TypegenWatchModeTrace} from '@sanity/codegen'
import {type TelemetryEvent} from '@sanity/telemetry'
import {cleanAll, pendingMocks} from 'nock'
import {glob} from 'tinyglobby'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setupTelemetry} from '../../../../src/hooks/prerun/setupTelemetry.js'
import {TELEMETRY_API_VERSION} from '../../../../src/services/telemetry.js'
import {commandIdentity} from '../../../../src/util/telemetry/cliCommandIdentity.js'
import {flushTelemetryFiles} from '../../../../src/util/telemetry/flushTelemetryFiles.js'
import {readNDJSON} from '../../../../src/util/telemetry/readNDJSON.js'
import {sanitizeTelemetryEvent} from '../../../../src/util/telemetry/sanitizeTelemetryEvent.js'
import {getCommandAndConfig} from '../../../helpers/getCommandAndConfig.js'

const mockTelemetryDebug = vi.hoisted(() => {
  const debug = vi.fn()
  return Object.assign(debug, {enabled: false, extend: () => debug})
})

// Mock external dependencies
vi.mock('node:os', () => ({tmpdir: vi.fn()}))
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual('node:child_process')
  return {
    ...actual,
    spawn: vi.fn(),
  }
})
vi.mock('@sanity/cli-core', async () => ({
  ...(await vi.importActual('@sanity/cli-core')),
  findProjectRoot: vi.fn(),
  getCliConfig: vi.fn(),
  getUserConfig: vi.fn(),
  isCi: vi.fn(() => false),
}))
vi.mock('../../../../src/actions/telemetry/telemetryDebug.js', () => ({
  telemetryDebug: mockTelemetryDebug,
}))

const mockTmpdir = vi.mocked(tmpdir)
const mockSpawn = vi.mocked(spawn)
const mockFindProjectRoot = vi.mocked(findProjectRoot)
const mockGetCliConfig = vi.mocked(getCliConfig)
const mockGetUserConfig = vi.mocked(getUserConfig)
const mockIsCi = vi.mocked(isCi)

const {config} = await getCommandAndConfig('help')
// Create mock functions for getUserConfig get/set methods
const mockGet = vi.fn()
const mockSet = vi.fn()

const WAIT_FOR_OPERATIONS = 200

// Helper functions for mock setup
function setupTestDirectory() {
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(7)
  const testDir = join(
    process.cwd(),
    'tmp',
    'telemetry-integration-tests',
    `test-${timestamp}-${random}`,
  )
  const telemetryPath = join(testDir, '.config', 'sanity')
  return {telemetryPath, testDir}
}

function setupBasicMocks(testDir: string) {
  mockTmpdir.mockReturnValue(testDir)
  createTestToken('test-auth-token-123')
}

function setupUserConfigMock(
  options = {telemetryDisclosed: true} as {telemetryDisclosed: boolean},
) {
  const mockConfig = new Map()
  if (options.telemetryDisclosed) {
    mockConfig.set('telemetryDisclosed', Date.now())
  }
  mockGetUserConfig.mockReturnValue({
    delete: vi.fn().mockImplementation((key) => mockConfig.delete(key)),
    get: vi.fn().mockImplementation((key) => mockConfig.get(key)),
    set: vi.fn().mockImplementation((key, value) => mockConfig.set(key, value)),
  })
}

function setupProjectMocks(testDir: string) {
  mockFindProjectRoot.mockResolvedValue({
    directory: testDir,
    path: join(testDir, 'sanity.cli.ts'),
    type: 'studio',
  })

  mockGetCliConfig.mockResolvedValue({
    api: {
      dataset: 'test-dataset',
      projectId: 'pr0j1234',
    },
  })
}

function setupSpawnMock() {
  mockSpawn.mockReturnValue({
    unref: vi.fn(),
  } as Partial<ChildProcess> as ChildProcess)
}

function captureProcessExit() {
  let capturedHandler: ((code: number) => void) | undefined
  vi.spyOn(process, 'once').mockImplementation(((
    event: string | symbol,
    handler: (code: number) => void,
  ) => {
    if (event === 'exit' && typeof handler === 'function') {
      capturedHandler = handler
    }
    return process
  }) as typeof process.once)
  return () => capturedHandler
}

describe('setupTelemetry integration test', () => {
  let testDir: string
  let telemetryPath: string

  beforeEach(async () => {
    // Only create test directory - each test sets up its own mocks
    const {telemetryPath: path, testDir: dir} = setupTestDirectory()
    testDir = dir
    telemetryPath = path
    await mkdir(telemetryPath, {recursive: true})

    // Set up default getUserConfig mock to return mock get/set/delete functions
    mockGetUserConfig.mockReturnValue({
      delete: vi.fn(),
      get: mockGet,
      set: mockSet,
    })

    // Reset all mocks before each test
    mockGet.mockReset()
    mockSet.mockReset()
    mockIsCi.mockReset().mockReturnValue(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])

    // Reset globalThis.cliTelemetry after each test
    clearCliTelemetry()
  })

  test('preserves every resolved built-in and bundled plugin command without positional input', async () => {
    const pluginCommands = config.commands.filter((command) =>
      ['@sanity/runtime-cli', '@sanity/workflow-cli'].includes(command.pluginName ?? ''),
    )
    expect(new Set(pluginCommands.map((command) => command.pluginName))).toEqual(
      new Set(['@sanity/runtime-cli', '@sanity/workflow-cli']),
    )
    for (const command of config.commands) {
      const {id} = await command.load()
      const [groupOrCommand, ...commandArguments] = id.split(':')
      const expected = {commandArguments, groupOrCommand}
      expect(commandIdentity(id, ['private-input']), id).toEqual(expected)
      expect(commandIdentity(groupOrCommand, [...commandArguments, 'private-input']), id).toEqual(
        expected,
      )
    }
  })

  test('recognizes the watch event emitted by the installed TypeGen package', () => {
    const {name, version} = TypegenWatchModeTrace
    const data = {
      averageGenerationDuration: 25,
      generationFailedCount: 0,
      generationSuccessfulCount: 3,
      step: 'stopped',
      watcherDuration: 1500,
    }
    expect(
      sanitizeTelemetryEvent({
        context: undefined,
        createdAt: new Date().toISOString(),
        data,
        name,
        sessionId: 'session_01h3s55cezeqby0hf79brgdqj0',
        traceId: 'trace_01h3s55cezeqby0hf79brgdqj0',
        type: 'trace.log',
        version,
      }),
    ).toMatchObject({data, name, version})
  })

  test('shows telemetry disclosure when not previously disclosed', async () => {
    const {stderr} = await testHook<'prerun'>(setupTelemetry, {
      config,
    })

    expect(mockGet).toHaveBeenCalledWith('telemetryDisclosed')
    expect(mockSet).toHaveBeenCalledWith('telemetryDisclosed', expect.any(Number))
    expect(stderr).toMatchInlineSnapshot(`
      "
      ╭─────────────────────────────────────────────────────────────────────────────╮
      │                                                                             │
      │   The Sanity CLI now collects telemetry data on general usage and errors.   │
      │   This helps us improve Sanity and prioritize features.                     │
      │                                                                             │
      │   To opt in/out, run npx sanity telemetry enable/disable.                   │
      │                                                                             │
      │   Learn more here:                                                          │
      │   https://www.sanity.io/telemetry                                           │
      │                                                                             │
      ╰─────────────────────────────────────────────────────────────────────────────╯

      "
    `)
  })

  test('does not show disclosure when already disclosed', async () => {
    mockGet.mockReturnValue(1_234_567_890) // Already disclosed timestamp

    const {stderr} = await testHook<'prerun'>(setupTelemetry, {
      config,
    })

    expect(mockGet).toHaveBeenCalledWith('telemetryDisclosed')
    expect(mockSet).not.toHaveBeenCalled()
    expect(stderr).toBe('')
  })

  test('does not show disclosure in CI environment', async () => {
    mockIsCi.mockReturnValue(true)

    const {stderr} = await testHook<'prerun'>(setupTelemetry, {
      config,
    })

    expect(mockGet).not.toHaveBeenCalled()
    expect(mockSet).not.toHaveBeenCalled()
    expect(stderr).toBe('')
  })

  test('sets disclosure timestamp when showing disclosure', async () => {
    const beforeTime = Date.now()

    await testHook<'prerun'>(setupTelemetry, {
      config,
    })

    const afterTime = Date.now()
    expect(mockSet).toHaveBeenCalledWith('telemetryDisclosed', expect.any(Number))

    const timestamp = mockSet.mock.calls[0][1]
    expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
    expect(timestamp).toBeLessThanOrEqual(afterTime)
  })

  test.each([
    {
      expected: ['--dataset', '--project-id'],
      flags: ['-dprivate', '-pprivate'],
      id: 'documents:validate',
    },
    {
      expected: ['--dataset', '--project-id'],
      flags: ['-d=private', '-p=private'],
      id: 'documents:validate',
    },
    {
      expected: ['--dataset', '--project-id'],
      flags: ['-d', 'private', '-p', 'private'],
      id: 'documents:validate',
    },
    {
      expected: ['--file', '--format=json'],
      flags: ['--file=private', '--format=json'],
      id: 'documents:validate',
    },
    {
      expected: ['--token', '--header', '--field', '--raw-field', '--input', '--method=GET'],
      flags: [
        '-tprivate',
        '-HAuthorization: Bearer private',
        '--field=private',
        '--raw-field=private',
        '--input=private',
        '--method=GET',
      ],
      id: 'api',
    },
    {
      expected: ['--token'],
      flags: ['--token=private', '--replace'],
      id: 'datasets:import',
    },
    {expected: ['--token'], flags: ['--token=private'], id: 'tokens:rotate'},
    {
      expected: ['--template-token', '--env', '--git', '--bare'],
      flags: ['--template-token=private', '--env=private', '--git=private', '--bare'],
      id: 'init',
    },
  ])(
    'keeps $id usage while excluding private values from files and uploads',
    async ({expected, flags, id}) => {
      const {Command} = await getCommandAndConfig(id)
      setupBasicMocks(testDir)
      setupUserConfigMock({telemetryDisclosed: true})
      setupProjectMocks(testDir)
      captureProcessExit()
      mockApi({
        apiVersion: TELEMETRY_API_VERSION,
        query: {tag: 'sanity.cli.telemetry-consent'},
        uri: '/intake/telemetry-status',
      }).reply(200, {status: 'granted'})

      const secret = `sk${'A'.repeat(178)}`
      const originalArgv = process.argv
      process.argv = [
        'node',
        'sanity',
        ...id.split(':'),
        'private@example.test',
        ...flags,
        '--',
        `--token=${secret}`,
      ]
      try {
        await testHook<'prerun'>(setupTelemetry, {Command, config})
        reportCliTraceError(new TypeError(`Invalid private input ${secret}`))
        const expectedContext = {
          commandArguments: id.split(':').slice(1),
          extraArguments: expected,
          groupOrCommand: id.split(':')[0],
        }
        let telemetryFile = ''
        await vi.waitFor(async () => {
          const files = await glob(normalizePath(join(telemetryPath, 'telemetry-*.ndjson')))
          expect(files).toHaveLength(1)
          telemetryFile = files[0]
          const events = await readNDJSON<TelemetryEvent>(telemetryFile)
          expect(events).toContainEqual(
            expect.objectContaining({
              context: expect.objectContaining(expectedContext),
              type: 'trace.start',
              version: 2,
            }),
          )
          expect(events).toContainEqual(
            expect.objectContaining({
              context: expect.objectContaining(expectedContext),
              data: {message: 'CLI operation failed', name: 'TypeError'},
              type: 'trace.error',
            }),
          )
          expect(events).toContainEqual(
            expect.objectContaining({
              properties: expect.objectContaining({cliVersion: config.version}),
              type: 'userProperties',
            }),
          )
          expect(JSON.stringify(events)).not.toContain('private')
          expect(JSON.stringify(events)).not.toContain(secret)
        })

        const legacyEvent = {
          context: {
            commandArguments: [secret],
            extraArguments: ['--token=private'],
            groupOrCommand: 'deploy',
          },
          createdAt: new Date().toISOString(),
          data: {message: 'private', name: 'Error', stack: secret},
          name: 'CLI Command Executed',
          sessionId: 'session_01h3s55cezeqby0hf79brgdqj0',
          traceId: 'trace_01h3s55cezeqby0hf79brgdqj0',
          type: 'trace.error',
          version: 1,
        }
        await appendFile(
          telemetryFile,
          JSON.stringify(legacyEvent) + '\nnull\nmalformed private input\n',
        )
        const sendEvents = vi.fn(async (_events: TelemetryEvent[]) => {})
        await flushTelemetryFiles({resolveConsent: async () => ({status: 'granted'}), sendEvents})
        expect(sendEvents).toHaveBeenCalledOnce()
        const sentEvents = sendEvents.mock.calls[0][0]
        expect(sentEvents).toContainEqual(
          expect.objectContaining({
            context: expect.objectContaining(expectedContext),
            type: 'trace.start',
          }),
        )
        expect(sentEvents).toContainEqual(
          expect.objectContaining({
            context: {commandArguments: [], extraArguments: ['--token'], groupOrCommand: 'deploy'},
            data: {message: 'CLI operation failed', name: 'Error'},
            sessionId: 'session_01h3s55cezeqby0hf79brgdqj0',
          }),
        )
        expect(JSON.stringify(sentEvents)).not.toContain(secret)
        expect(JSON.stringify(sentEvents)).not.toContain('private')
        expect(JSON.stringify(mockTelemetryDebug.mock.calls)).not.toContain('private')
        expect(process.argv).toEqual([
          'node',
          'sanity',
          ...id.split(':'),
          'private@example.test',
          ...flags,
          '--',
          `--token=${secret}`,
        ])
      } finally {
        process.argv = originalArgv
      }
    },
  )

  test('should handle complete telemetry lifecycle from initialization to flush', async () => {
    setupBasicMocks(testDir)
    setupUserConfigMock({telemetryDisclosed: true})
    setupProjectMocks(testDir)
    setupSpawnMock()
    const getProcessExitHandler = captureProcessExit()

    mockApi({
      apiVersion: TELEMETRY_API_VERSION,
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'granted'})

    const originalArgv = process.argv
    process.argv = ['node', 'sanity', 'deploy']

    try {
      await testHook<'prerun'>(setupTelemetry, {config})

      // Wait for consent to resolve and buffered events to flush
      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_OPERATIONS))

      const telemetryFiles = await glob(normalizePath(join(telemetryPath, 'telemetry-*.ndjson')))
      expect(telemetryFiles).toHaveLength(1)
      expect(telemetryFiles[0]).toMatch(/telemetry-[a-f0-9]+-\w+-[\w-]+\.ndjson$/)

      const events = await readNDJSON<TelemetryEvent>(telemetryFiles[0])

      // Early events buffered during async init should now be present
      expect(events.find((e) => e.type === 'userProperties')).toBeDefined()
      expect(events.find((e) => e.type === 'trace.start')).toBeDefined()

      // Simulate process exit with status 0
      const capturedProcessExit = getProcessExitHandler()
      expect(capturedProcessExit).toBeDefined()
      capturedProcessExit?.(0)

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_OPERATIONS))

      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        [expect.stringMatching(/flushTelemetry\.worker\.js$/)],
        expect.objectContaining({
          detached: true,
          env: expect.objectContaining({
            SANITY_TELEMETRY_PROJECT_ID: 'pr0j1234',
          }),
        }),
      )

      const sentEvents: TelemetryEvent[] = []
      const mockSendEvents = vi.fn().mockImplementation((evts: TelemetryEvent[]) => {
        sentEvents.push(...evts)
        return Promise.resolve()
      })

      await flushTelemetryFiles({
        resolveConsent: async () => ({status: 'granted'}),
        sendEvents: mockSendEvents,
      })

      expect(mockSendEvents).toHaveBeenCalledTimes(1)
      expect(sentEvents.length).toBeGreaterThanOrEqual(1)

      const remainingFiles = await glob(normalizePath(join(telemetryPath, 'telemetry-*.ndjson')))
      expect(remainingFiles).toHaveLength(0)
    } finally {
      process.argv = originalArgv
    }
  })

  test('should discard buffered events and write no files when consent resolution fails', async () => {
    setupBasicMocks(testDir)
    setupUserConfigMock({telemetryDisclosed: true})
    setupProjectMocks(testDir)

    mockApi({
      apiVersion: TELEMETRY_API_VERSION,
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(500, {error: 'Internal Server Error'})

    const originalArgv = process.argv
    process.argv = ['node', 'sanity', 'deploy']

    try {
      await testHook<'prerun'>(setupTelemetry, {config})

      // Wait for consent to fail and buffer to be discarded
      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_OPERATIONS))

      // Consent was undetermined — buffer discarded, no files written
      const telemetryFiles = await glob(normalizePath(join(telemetryPath, 'telemetry-*.ndjson')))
      expect(telemetryFiles).toHaveLength(0)

      // Telemetry infrastructure is still set up
      expect(getCliTelemetry()).toBeDefined()
    } finally {
      process.argv = originalArgv
    }
  })

  test('ensures globalThis.cliTelemetry is set', async () => {
    const global = globalThis as typeof globalThis & {
      [CLI_TELEMETRY_SYMBOL]?: {logger: unknown; reportTraceError?: unknown}
    }
    expect(global[CLI_TELEMETRY_SYMBOL]).toBeUndefined()

    await testHook<'prerun'>(setupTelemetry, {config})

    expect(global[CLI_TELEMETRY_SYMBOL]).toBeDefined()
    expect(getCliTelemetry()).toEqual(global[CLI_TELEMETRY_SYMBOL]?.logger)
  })

  test('should initialize telemetry when project root is not found', async () => {
    setupBasicMocks(testDir)
    setupUserConfigMock({telemetryDisclosed: true})
    setupSpawnMock()
    const getProcessExitHandler = captureProcessExit()

    // Mock findProjectRoot to throw an error
    mockFindProjectRoot.mockRejectedValue(new Error('Project root not found'))

    const originalArgv = process.argv
    process.argv = ['node', 'sanity', 'help']

    try {
      await testHook<'prerun'>(setupTelemetry, {config})

      // Wait for telemetry initialization
      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_OPERATIONS))

      // Verify telemetry still gets initialized
      expect(getCliTelemetry()).toBeDefined()

      // Verify worker spawn happens without project config
      const capturedProcessExit = getProcessExitHandler()
      expect(capturedProcessExit).toBeDefined()
      capturedProcessExit?.(0)

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_OPERATIONS))

      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        [expect.stringMatching(/flushTelemetry\.worker\.js$/)],
        expect.objectContaining({
          detached: true,
          env: expect.objectContaining({
            SANITY_TELEMETRY_PROJECT_ID: '', // Empty since no config found
          }),
        }),
      )
    } finally {
      process.argv = originalArgv
    }
  })

  test('should initialize telemetry when getCliConfig fails', async () => {
    setupBasicMocks(testDir)
    setupUserConfigMock({telemetryDisclosed: true})
    setupSpawnMock()
    const getProcessExitHandler = captureProcessExit()

    // Mock findProjectRoot to succeed but getCliConfig to throw
    mockFindProjectRoot.mockResolvedValue({
      directory: testDir,
      path: join(testDir, 'sanity.cli.ts'),
      type: 'studio',
    })
    mockGetCliConfig.mockRejectedValue(new Error('Failed to read config'))

    const originalArgv = process.argv
    process.argv = ['node', 'sanity', 'help']

    try {
      await testHook<'prerun'>(setupTelemetry, {config})

      // Wait for telemetry initialization
      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_OPERATIONS))

      // Verify telemetry still gets initialized
      expect(getCliTelemetry()).toBeDefined()

      // Verify worker spawn happens without project config
      const capturedProcessExit = getProcessExitHandler()
      expect(capturedProcessExit).toBeDefined()
      capturedProcessExit?.(0)

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_OPERATIONS))

      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        [expect.stringMatching(/flushTelemetry\.worker\.js$/)],
        expect.objectContaining({
          detached: true,
          env: expect.objectContaining({
            SANITY_TELEMETRY_PROJECT_ID: '', // Empty since config read failed
          }),
        }),
      )
    } finally {
      process.argv = originalArgv
    }
  })
})
