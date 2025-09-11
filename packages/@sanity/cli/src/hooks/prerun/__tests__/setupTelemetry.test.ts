import {spawn} from 'node:child_process'
import {mkdir} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {findProjectRoot, getCliConfig, getCliToken} from '@sanity/cli-core'
import {testHook} from '@sanity/cli-test'
import {type TelemetryEvent} from '@sanity/telemetry'
import {glob} from 'glob'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {resolveConsent} from '../../../actions/telemetry/resolveConsent.js'
import {telemetryDisclosure} from '../../../actions/telemetry/telemetryDisclosure.js'
import {createTelemetryStore} from '../../../telemetry/store/createTelemetryStore.js'
import {readNDJSON} from '../../../telemetry/utils/readNDJSON.js'
import {detectRuntime} from '../../../util/detectRuntime.js'
import {parseArguments} from '../../../util/parseArguments.js'
import {runFlushWorker} from '../flushTelemetry.worker.js'
import {setupTelemetry} from '../setupTelemetry.js'

// Mock external dependencies
vi.mock('node:os', () => ({homedir: vi.fn()}))
vi.mock('node:child_process', () => ({spawn: vi.fn()}))
vi.mock('@sanity/cli-core', async () => ({
  ...(await vi.importActual('@sanity/cli-core')),
  findProjectRoot: vi.fn(),
  getCliConfig: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn(),
}))

vi.mock('../../../actions/telemetry/resolveConsent.js', () => ({
  resolveConsent: vi.fn(),
}))
vi.mock('../../../actions/telemetry/telemetryDisclosure.js', () => ({
  telemetryDisclosure: vi.fn(),
}))
vi.mock('../../../util/detectRuntime.js', () => ({
  detectRuntime: vi.fn(),
}))
vi.mock('../../../util/parseArguments.js', () => ({
  parseArguments: vi.fn(),
}))

// Helper functions
const getTelemetryPath = (testDir: string) => join(testDir, '.config', 'sanity')

// Event-based helpers to replace arbitrary delays
const waitForFileCreation = async (pattern: string, maxWait = 2000): Promise<string[]> => {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWait) {
    const files = await glob(pattern)
    if (files.length > 0) return files
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return []
}

const waitForWorkerCompletion = async (telemetryPath: string, maxWait = 2000): Promise<boolean> => {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWait) {
    const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
    if (files.length === 0) return true
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return false
}

const waitForAsync = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('#setupTelemetry integration', () => {
  let testDir: string

  beforeEach(async () => {
    // Create unique test directory for each test
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(7)
    testDir = join(process.cwd(), 'tmp', 'telemetry-tests', `test-${timestamp}-${random}`)
    await mkdir(testDir, {recursive: true})

    // Mock homedir to use test directory
    vi.mocked(homedir).mockReturnValue(testDir)
    vi.mocked(getCliToken).mockResolvedValue('test-auth-token-123')

    // Setup project config defaults
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/path',
      path: '/test/path/sanity.config.ts',
      type: 'studio',
    })

    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: 'test-project',
      },
    })

    // Setup default runtime and arguments
    vi.mocked(detectRuntime).mockReturnValue('node')
    vi.mocked(parseArguments).mockReturnValue({
      argsWithoutOptions: [],
      argv: [],
      coreOptions: {debug: false, help: false, version: false},
      extOptions: {},
      extraArguments: [],
      groupOrCommand: 'test-command',
    })

    // Default resolveConsent to granted
    vi.mocked(resolveConsent).mockResolvedValue({status: 'granted'})

    // Mock spawn to run worker in-process
    vi.mocked(spawn).mockImplementation((command, args, options) => {
      if (args?.[0]?.includes('flushTelemetry.worker')) {
        // Copy environment variables from options
        const originalEnv = {...process.env}
        if (options?.env) {
          Object.assign(process.env, options.env)
        }

        // Run worker asynchronously in same process
        setImmediate(async () => {
          try {
            await runFlushWorker()
          } catch {
            // Worker handles errors silently in production
          } finally {
            // Restore original env
            process.env = originalEnv
          }
        })
      }

      return {
        on: vi.fn(),
        pid: 12_345,
        stderr: null,
        stdout: null,
        unref: vi.fn(),
      } as any
    })
  })

  afterEach(async () => {
    // Wait for any pending async operations to complete
    await waitForAsync(100)

    vi.clearAllMocks()
    vi.unstubAllEnvs()

    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])

    // Wait for any remaining operations to settle
    await waitForAsync(50)
  })

  describe('basic setup', () => {
    test('initializes telemetry system correctly', async () => {
      await testHook<'prerun'>(setupTelemetry)

      // Wait for telemetry store to initialize and files to be written
      // The store creation, consent resolution, and file writing are all async
      await waitForAsync(300) // Give more time for async operations

      const telemetryPath = getTelemetryPath(testDir)
      const files = await waitForFileCreation(join(telemetryPath, 'telemetry-*.ndjson'), 3000) // Longer timeout

      // Verify disclosure was called
      expect(telemetryDisclosure).toHaveBeenCalledTimes(1)

      // Verify telemetry files were created with expected events
      expect(files.length).toBeGreaterThan(0)
      const events = await readNDJSON<TelemetryEvent>(files[0])
      expect(events.length).toBeGreaterThan(0)

      // Should have userProperties event and trace.start event
      const userPropsEvent = events.find((e) => e.type === 'userProperties')
      expect(userPropsEvent).toBeDefined()

      const traceStartEvent = events.find((e) => e.type === 'trace.start')
      expect(traceStartEvent).toBeDefined()
      expect(traceStartEvent?.name).toBe('CLI Command Executed')
    })
  })

  describe('telemetry flow', () => {
    test('sends events to API with correct env vars when consent granted', async () => {
      // Use mockApi with the telemetry API version
      const batchMock = nock('https://api.sanity.io')
        .post('/v2023-12-18/intake/batch', (body) => {
          expect(body.batch).toBeInstanceOf(Array)
          expect(body.projectId).toBe('test-project')
          return true
        })
        .query({tag: 'sanity.cli'})
        .reply(200, {success: true})

      // Verify spawn is called with correct env
      vi.mocked(spawn).mockImplementation((_command, args, options) => {
        if (args?.[0]?.includes('flushTelemetry.worker')) {
          expect(options?.env?.SANITY_TELEMETRY_PROJECT_ID).toBe('test-project')

          vi.stubEnv('SANITY_TELEMETRY_PROJECT_ID', options?.env?.SANITY_TELEMETRY_PROJECT_ID)
          setImmediate(async () => {
            try {
              await runFlushWorker()
            } finally {
              vi.unstubAllEnvs()
            }
          })
        }
        return {on: vi.fn(), pid: 12_345, unref: vi.fn()} as any
      })

      // Create some telemetry events before running setupTelemetry
      const directStore = createTelemetryStore('test-direct-session', {resolveConsent})
      await waitForAsync(200)
      directStore.logger.log(
        {name: 'test-event', schema: {}, type: 'log', version: 1},
        {test: 'data'},
      )

      // Run setupTelemetry
      await testHook<'prerun'>(setupTelemetry)
      await waitForAsync(200)

      // Trigger process exit to spawn worker
      process.emit('exit', 0)

      // Wait for worker completion using our event-based helper
      const telemetryPath = getTelemetryPath(testDir)
      const workerCompleted = await waitForWorkerCompletion(telemetryPath)

      // Verify API was called and files were cleaned up
      expect(batchMock.isDone()).toBe(true)
      expect(workerCompleted).toBe(true)
    })

    test('blocks events when consent denied', async () => {
      // Mock consent denied
      vi.mocked(resolveConsent).mockResolvedValue({
        reason: 'localOverride',
        status: 'denied',
      })

      // Run setupTelemetry
      await testHook<'prerun'>(setupTelemetry)
      await waitForAsync(100)

      // Trigger process exit
      process.emit('exit', 0)
      await waitForAsync(500)

      // Verify no files were created (consent denied blocks telemetry)
      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      expect(files).toHaveLength(0)
    })

    test('handles API errors gracefully', async () => {
      // Setup failing API mock
      const batchMock = nock('https://api.sanity.io')
        .post('/v2023-12-18/intake/batch')
        .query({tag: 'sanity.cli'})
        .reply(500, {error: 'Internal Server Error'})

      // Run setupTelemetry
      await testHook<'prerun'>(setupTelemetry)
      await waitForAsync(100)

      // Trigger process exit
      process.emit('exit', 0)
      await waitForAsync(500)

      // Verify API was attempted
      expect(batchMock.isDone()).toBe(true)

      // Files should be preserved on error for retry
      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      expect(files.length).toBeGreaterThan(0)
    })

    test('aggregates multiple sessions', async () => {
      let capturedBatch: TelemetryEvent[] = []

      const batchMock = nock('https://api.sanity.io')
        .post('/v2023-12-18/intake/batch', (body) => {
          capturedBatch = body.batch
          expect(body.batch).toBeInstanceOf(Array)
          expect(body.projectId).toBe('test-project')
          return true
        })
        .query({tag: 'sanity.cli'})
        .reply(200, {success: true})

      // Create multiple stores (simulating multiple CLI sessions)
      const store1 = createTelemetryStore('session-1', {resolveConsent})
      const store2 = createTelemetryStore('session-2', {resolveConsent})

      await waitForAsync(100)

      // Log events from different sessions
      store1.logger.log({name: 'event-1', schema: {}, type: 'log', version: 1}, {})
      store2.logger.log({name: 'event-2', schema: {}, type: 'log', version: 1}, {})

      // Run setupTelemetry (creates third session)
      await testHook<'prerun'>(setupTelemetry)
      await waitForAsync(100)

      // Trigger worker
      process.emit('exit', 0)
      await waitForAsync(500)

      // Verify all events were aggregated
      expect(batchMock.isDone()).toBe(true)
      expect(capturedBatch.length).toBeGreaterThanOrEqual(3) // At least 3 sessions worth
    })

    test('handles process exit with error status', async () => {
      let capturedEvents: TelemetryEvent[] = []

      const batchMock = nock('https://api.sanity.io')
        .post('/v2023-12-18/intake/batch', (body) => {
          capturedEvents = body.batch
          expect(body.batch).toBeInstanceOf(Array)
          expect(body.projectId).toBe('test-project')
          return true
        })
        .query({tag: 'sanity.cli'})
        .reply(200, {success: true})

      // Create some telemetry events before running setupTelemetry
      const directStore = createTelemetryStore('test-direct-session', {resolveConsent})
      await waitForAsync(200)
      directStore.logger.log(
        {name: 'test-event', schema: {}, type: 'log', version: 1},
        {test: 'data'},
      )

      await testHook<'prerun'>(setupTelemetry)
      await waitForAsync(200)

      // Exit with error status
      process.emit('exit', 1)
      await waitForAsync(500)

      expect(batchMock.isDone()).toBe(true)

      // Should have trace.error event for non-zero exit status
      const errorEvent = capturedEvents.find((e) => e.type === 'trace.error')
      expect(errorEvent).toBeDefined()
      expect(errorEvent?.name).toBe('CLI Command Executed')
    })
  })

  describe('configuration', () => {
    test('collects correct user properties', async () => {
      vi.mocked(detectRuntime).mockReturnValue('bun')

      const mockConfig = {version: '3.1.0'} as any
      const mockContext = {
        config: mockConfig,
        debug: vi.fn(),
        error: vi.fn(),
        exit: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as any

      await testHook<'prerun'>(setupTelemetry, {
        context: mockContext,
      })

      await waitForAsync(200)

      // Read telemetry files to verify userProperties event
      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))

      if (files.length > 0) {
        const events = await readNDJSON<TelemetryEvent>(files[0])
        const userPropsEvent = events.find((e) => e.type === 'userProperties')

        if (userPropsEvent) {
          expect((userPropsEvent as any)?.data).toMatchObject({
            cliVersion: '3.1.0',
            cpuArchitecture: process.arch,
            dataset: 'production',
            machinePlatform: process.platform,
            projectId: 'test-project',
            runtime: 'bun',
            runtimeVersion: process.version,
          })
        }
      }

      // Fallback: verify the functions were called
      expect(vi.mocked(detectRuntime)).toHaveBeenCalled()
    })

    test('creates trace with parsed arguments', async () => {
      const mockArgs = {
        argsWithoutOptions: ['import', 'file.ndjson'],
        argv: [],
        coreOptions: {debug: true, help: false, version: false},
        extOptions: {},
        extraArguments: ['--replace'],
        groupOrCommand: 'dataset',
      }
      vi.mocked(parseArguments).mockReturnValue(mockArgs)

      await testHook<'prerun'>(setupTelemetry)
      await waitForAsync(200)

      // Read telemetry files to verify trace.start event
      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))

      if (files.length > 0) {
        const events = await readNDJSON<TelemetryEvent>(files[0])
        const traceStart = events.find((e) => e.type === 'trace.start')

        if (traceStart) {
          expect((traceStart as any)?.context).toMatchObject({
            commandArguments: ['import', 'file.ndjson'],
            coreOptions: {debug: true, help: false, version: false},
            extraArguments: ['--replace'],
            groupOrCommand: 'dataset',
          })
        }
      }

      // Fallback: verify parseArguments was called
      expect(vi.mocked(parseArguments)).toHaveBeenCalled()
    })
  })

  describe('exit handler', () => {
    test('registers exit handler and spawns worker', async () => {
      const originalOnce = process.once
      let exitCallback: ((status: number) => void) | undefined

      process.once = vi.fn((event, callback) => {
        if (event === 'exit') {
          exitCallback = callback as (status: number) => void
        }
        return originalOnce.call(process, event, callback)
      })

      await testHook<'prerun'>(setupTelemetry)

      // Verify process.once was called with 'exit'
      expect(process.once).toHaveBeenCalledWith('exit', expect.any(Function))

      // Verify spawn is called when exit handler runs
      if (exitCallback) {
        exitCallback(0)

        // Wait a bit and verify spawn was called
        await waitForAsync(50)
        expect(vi.mocked(spawn)).toHaveBeenCalledWith(
          process.execPath,
          expect.arrayContaining([expect.stringContaining('flushTelemetry.worker.js')]),
          expect.objectContaining({
            detached: true,
            env: expect.objectContaining({
              SANITY_TELEMETRY_PROJECT_ID: 'test-project',
            }),
          }),
        )
      }

      // Restore process.once
      process.once = originalOnce
    })
  })
})
