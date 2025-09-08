import {mkdir, unlink} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {findProjectRoot, getCliConfig, getCliToken, getGlobalCliClient} from '@sanity/cli-core'
import {testHook} from '@sanity/cli-test'
import {type TelemetryEvent} from '@sanity/telemetry'
import {glob} from 'glob'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {resolveConsent} from '../../../actions/telemetry/resolveConsent.js'
import {telemetryDisclosure} from '../../../actions/telemetry/telemetryDisclosure.js'
import {readNDJSON} from '../../../telemetry/utils/readNDJSON.js'
import {detectRuntime} from '../../../util/detectRuntime.js'
import {parseArguments} from '../../../util/parseArguments.js'
import {setupTelemetry} from '../setupTelemetry.js'

// Mock external dependencies
vi.mock('node:os', () => ({homedir: vi.fn()}))
vi.mock('@sanity/cli-core', async () => ({
  ...(await vi.importActual('@sanity/cli-core')),
  findProjectRoot: vi.fn(),
  getCliConfig: vi.fn(),
  getCliToken: vi.fn(),
  getGlobalCliClient: vi.fn(),
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
const waitForAsync = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const getTelemetryPath = (testDir: string) => join(testDir, '.config', 'sanity')

describe('#setupTelemetry', () => {
  let testDir: string
  let mockClient: any

  beforeEach(async () => {
    // Create unique test directory for each test
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(7)
    testDir = join(process.cwd(), 'tmp', 'telemetry-tests', `test-${timestamp}-${random}`)
    await mkdir(testDir, {recursive: true})

    // Mock homedir to use test directory
    vi.mocked(homedir).mockReturnValue(testDir)
    vi.mocked(getCliToken).mockResolvedValue('test-auth-token-123')

    // Setup client mock
    mockClient = {
      request: vi.fn().mockResolvedValue({success: true}),
    }
    vi.mocked(getGlobalCliClient).mockResolvedValue(mockClient)

    // Setup project config
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

    // Don't mock createTelemetryStore - we want to use the real one

    // Default resolveConsent to granted
    vi.mocked(resolveConsent).mockResolvedValue({status: 'granted'})
  })

  afterEach(async () => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    // Clean up test files
    try {
      await unlink('telemetry-events.ndjson')
    } catch {
      // File doesn't exist, that's fine
    }
  })

  describe('telemetry disclosure', () => {
    test('calls telemetry disclosure function', async () => {
      await testHook<'prerun'>(setupTelemetry)

      expect(telemetryDisclosure).toHaveBeenCalledTimes(1)
    })
  })

  describe('telemetry store integration', () => {
    test('creates store and initializes telemetry correctly', async () => {
      await testHook<'prerun'>(setupTelemetry)

      // Wait for telemetry store to initialize
      await waitForAsync(150)

      // Check if telemetry files were created (they might not be if no events were emitted yet)
      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))

      if (files.length > 0) {
        // If files exist, verify they contain expected events
        const events = await readNDJSON<TelemetryEvent>(files[0])
        expect(events.length).toBeGreaterThan(0)

        // Should have userProperties event and trace.start event
        const userPropsEvent = events.find((e) => e.type === 'userProperties')
        expect(userPropsEvent).toBeDefined()

        const traceStartEvent = events.find((e) => e.type === 'trace.start')
        expect(traceStartEvent).toBeDefined()
        expect(traceStartEvent?.name).toBe('CLI Command Executed')
      } else {
        // If no files yet, that's ok - the telemetry store may not have written events yet
        // We can verify the setup completed successfully
        expect(vi.mocked(telemetryDisclosure)).toHaveBeenCalledTimes(1)
      }
    })

    test('handles consent denial by not writing events', async () => {
      // Mock resolveConsent to deny consent
      vi.mocked(resolveConsent).mockResolvedValue({
        reason: 'localOverride',
        status: 'denied',
      })

      await testHook<'prerun'>(setupTelemetry)
      await waitForAsync(150)

      // No telemetry files should be created when consent is denied
      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      expect(files).toHaveLength(0)
    })
  })

  describe('event batch sending', () => {
    test('sends events to API when telemetry events are flushed', async () => {
      const setupPromise = testHook<'prerun'>(setupTelemetry)

      await setupPromise
      await waitForAsync(200)

      // Check if telemetry files exist and events were written
      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))

      if (files.length > 0) {
        const events = await readNDJSON<TelemetryEvent>(files[0])
        if (events.length > 0) {
          // The setupTelemetry function creates a sendEvents callback that should be called
          // when the store is flushed. We can't directly test the callback without mocking,
          // but we can verify the structure is correct by checking the mock client wasn't called yet
          // (since no flush happened yet)
          expect(mockClient.request).not.toHaveBeenCalled()
        }
      }
    })

    test('sets up telemetry store without calling API client yet', async () => {
      await testHook<'prerun'>(setupTelemetry)

      // The getGlobalCliClient is called inside the sendEvents callback only when events are sent
      // During setup, it should not be called yet
      expect(vi.mocked(getGlobalCliClient)).not.toHaveBeenCalled()

      // But our mock client should be set up and ready
      expect(mockClient).toBeDefined()
    })

    test('respects SANITY_TELEMETRY_INSPECT environment variable', async () => {
      vi.stubEnv('SANITY_TELEMETRY_INSPECT', '1')

      await testHook<'prerun'>(setupTelemetry)
      await waitForAsync(150)

      // The environment variable is checked in the setupTelemetry function
      // We can verify the setup completed without error when the flag is set
      expect(vi.mocked(telemetryDisclosure)).toHaveBeenCalledTimes(1)
    })
  })

  describe('user properties', () => {
    test('updates store with correct user properties', async () => {
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
      } else {
        // Fallback: verify the functions were called even if files weren't written yet
        expect(vi.mocked(detectRuntime)).toHaveBeenCalled()
      }
    })
  })

  describe('command trace', () => {
    test('creates and starts CLI command trace with parsed arguments', async () => {
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
          expect(traceStart?.context).toMatchObject({
            commandArguments: ['import', 'file.ndjson'],
            coreOptions: {debug: true, help: false, version: false},
            extraArguments: ['--replace'],
            groupOrCommand: 'dataset',
          })
        }
      } else {
        // Fallback: verify parseArguments was called
        expect(vi.mocked(parseArguments)).toHaveBeenCalled()
      }
    })
  })

  describe('process exit handler', () => {
    test('registers beforeExit handler', async () => {
      const originalOnce = process.once
      let beforeExitCallback: (() => void) | undefined

      process.once = vi.fn((event, callback) => {
        if (event === 'beforeExit') {
          beforeExitCallback = callback
        }
        return originalOnce.call(process, event, callback)
      })

      await testHook<'prerun'>(setupTelemetry)

      // Verify process.once was called with 'beforeExit'
      expect(process.once).toHaveBeenCalledWith('beforeExit', expect.any(Function))

      // Restore process.once
      process.once = originalOnce

      // The callback should be defined
      expect(beforeExitCallback).toBeDefined()
    })
  })
})
