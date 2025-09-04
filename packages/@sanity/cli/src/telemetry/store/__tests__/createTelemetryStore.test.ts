import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, readdirSync} from 'node:fs'
import {readFile, rm, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {getCliToken} from '@sanity/cli-core'
import {type TelemetryLogEvent} from '@sanity/telemetry'
import {glob} from 'glob'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  CONSENT_TEST_CASES,
  createMockConsent,
  createMockLogEvent,
  createMockTraceEvent,
  createNDJSONContent,
  createTestSessionId,
  parseNDJSONContent,
  TEST_AUTH_TOKEN,
  waitForAsync,
} from '../../../../test/telemetryFixtures.js'
import {createTelemetryStore} from '../createTelemetryStore.js'
import {findTelemetryFiles} from '../findTelemetryFiles.js'

let testDir: string

vi.mock('node:os', () => ({
  homedir: vi.fn(),
}))

vi.mock('@sanity/cli-core', async () => ({
  ...(await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')),
  getCliToken: vi.fn(() => Promise.resolve(TEST_AUTH_TOKEN)),
}))

const mockHomedir = vi.mocked(homedir)
const mockGetCliToken = vi.mocked(getCliToken)
const mockResolveConsent = vi.fn()
const mockSendEvents = vi.fn()

describe('#createTelemetryStore', () => {
  let sessionId: string

  beforeEach(() => {
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(7)
    testDir = join(process.cwd(), 'tmp', 'telemetry-tests', `test-${timestamp}-${random}`)

    mkdirSync(testDir, {recursive: true})

    sessionId = createTestSessionId()

    mockHomedir.mockReturnValue(testDir)

    // Set up default mocks that most tests expect
    mockResolveConsent.mockResolvedValue(createMockConsent('granted'))
    mockSendEvents.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Store Creation and Initialization', () => {
    it('should initialize store with consent and file path concurrently', async () => {
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      expect(mockResolveConsent).toHaveBeenCalledTimes(1)

      expect(mockGetCliToken).toHaveBeenCalledTimes(1)

      expect(existsSync(join(testDir, '.config', 'sanity'))).toBe(true)

      expect(store).toHaveProperty('logger')
      expect(store).toHaveProperty('flush')
      expect(store).toHaveProperty('end')
      expect(store).toHaveProperty('endWithBeacon')
    })

    it('should handle consent resolution failure gracefully', async () => {
      const consentError = new Error('Network error')
      mockResolveConsent.mockRejectedValue(consentError)

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      expect(store).toBeDefined()

      const testEvent = createMockLogEvent()
      store.logger.log({name: 'test', schema: {}, type: 'log', version: 1}, testEvent.data)

      await waitForAsync(100)

      const telemetryDir = join(testDir, '.config', 'sanity')
      const telemetryFiles = existsSync(telemetryDir)
        ? readdirSync(telemetryDir).filter((f: string) => f.includes('telemetry-'))
        : []
      expect(telemetryFiles).toHaveLength(0)
    })

    it('should handle file path generation failure gracefully', async () => {
      mockGetCliToken.mockRejectedValueOnce(new Error('Auth error'))

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      const testEvent = createMockLogEvent()
      store.logger.log({name: 'test', schema: {}, type: 'log', version: 1}, testEvent.data)

      await waitForAsync(100)

      const telemetryDir = join(testDir, '.config', 'sanity')
      const telemetryFiles = existsSync(telemetryDir)
        ? readdirSync(telemetryDir).filter((f: string) => f.includes('telemetry-'))
        : []
      expect(telemetryFiles).toHaveLength(0)
    })
  })

  describe.each(CONSENT_TEST_CASES)(
    'Consent Handling - $description',
    ({consent, shouldEmit, shouldFlush}) => {
      beforeEach(() => {
        mockResolveConsent.mockResolvedValue(createMockConsent(consent))
      })

      it(`should ${shouldEmit ? 'emit' : 'skip'} events with ${consent} consent`, async () => {
        const store = createTelemetryStore(sessionId, {
          resolveConsent: mockResolveConsent,
          sendEvents: mockSendEvents,
        })

        await waitForAsync(100)

        const testEvent = createMockLogEvent({sessionId})
        store.logger.log({name: 'test-event', schema: {}, type: 'log', version: 1}, testEvent.data)

        await waitForAsync(100)

        if (shouldEmit) {
          const files = await glob(join(testDir, '.config/sanity/telemetry-*.ndjson'))
          expect(files).toHaveLength(1)

          const content = await readFile(files[0], 'utf8')
          const events = parseNDJSONContent(content)
          expect(events).toHaveLength(1)
          expect((events[0] as TelemetryLogEvent).name).toBe('test-event')
          expect(events[0].sessionId).toBe(sessionId)
        } else {
          const telemetryDir = join(testDir, '.config', 'sanity')
          const telemetryFiles = existsSync(telemetryDir)
            ? readdirSync(telemetryDir).filter((f: string) => f.includes('telemetry-'))
            : []
          expect(telemetryFiles).toHaveLength(0)
        }
      })

      it(`should ${shouldFlush ? 'send' : 'cleanup'} events during flush with ${consent} consent`, async () => {
        const events1 = [createMockLogEvent({sessionId: 'session-1'})]
        const events2 = [createMockTraceEvent({sessionId: 'session-2'})]

        const telemetryDir = join(testDir, '.config', 'sanity')
        mkdirSync(telemetryDir, {recursive: true})

        // Create test files with valid telemetry naming pattern
        const hashedToken = createHash('sha256').update(TEST_AUTH_TOKEN).digest('hex').slice(0, 8)
        const filePath1 = join(telemetryDir, `telemetry-${hashedToken}-production-session-1.ndjson`)
        const filePath2 = join(telemetryDir, `telemetry-${hashedToken}-production-session-2.ndjson`)

        await writeFile(filePath1, createNDJSONContent(events1))
        await writeFile(filePath2, createNDJSONContent(events2))

        const store = createTelemetryStore(sessionId, {
          resolveConsent: mockResolveConsent,
          sendEvents: mockSendEvents,
        })

        await waitForAsync(100)

        await store.flush()

        if (shouldFlush) {
          expect(mockSendEvents).toHaveBeenCalledTimes(1)
          const sentEvents = mockSendEvents.mock.calls[0][0]
          expect(sentEvents).toHaveLength(2)

          expect(existsSync(filePath1)).toBe(false)
          expect(existsSync(filePath2)).toBe(false)
        } else {
          expect(mockSendEvents).not.toHaveBeenCalled()

          expect(existsSync(filePath1)).toBe(false)
          expect(existsSync(filePath2)).toBe(false)
        }
      })
    },
  )

  describe('Event Emission and File Operations', () => {
    it('should write events to session-specific files in NDJSON format', async () => {
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      const logEvent = createMockLogEvent({sessionId})

      store.logger.log({name: 'test-log', schema: {}, type: 'log', version: 1}, logEvent.data)
      store.logger
        .trace({context: undefined, name: 'test-trace', schema: {}, type: 'trace', version: 1})
        .start()

      await waitForAsync(100)

      const files = await glob(join(testDir, '.config/sanity/telemetry-*.ndjson'))
      expect(files).toHaveLength(1)

      const content = await readFile(files[0], 'utf8')
      expect(content).toBeDefined()

      const events = parseNDJSONContent(content)
      expect(events).toHaveLength(2)

      expect(events[0]).toMatchObject({
        data: logEvent.data,
        name: 'test-log',
        sessionId,
        type: 'log',
      })

      expect(events[1]).toMatchObject({
        name: 'test-trace',
        sessionId,
        type: 'trace.start',
      })
    })

    it('should continue operating when file writes fail', async () => {
      const nonWritableDir = join(testDir, 'readonly')
      mkdirSync(nonWritableDir, {recursive: true})

      mockGetCliToken.mockResolvedValueOnce('readonly-test-token')

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      store.logger.log({name: 'test', schema: {}, type: 'log', version: 1}, {test: true})

      await waitForAsync(100)

      expect(store).toBeDefined()

      consoleSpy.mockRestore()
    })

    it('should emit events asynchronously without blocking', async () => {
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      const start = Date.now()
      store.logger.log({name: 'test', schema: {}, type: 'log', version: 1}, {test: true})
      const end = Date.now()

      expect(end - start).toBeLessThan(10)

      await waitForAsync(60)

      const files = await findTelemetryFiles()
      expect(files).toHaveLength(1)
    })

    it('should safely handle concurrent event emissions without data loss', async () => {
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      const promises = Array.from({length: 5}, (_, i) => {
        store.logger.log({name: `concurrent-${i}`, schema: {}, type: 'log', version: 1}, {index: i})
        return waitForAsync(1)
      })

      await Promise.all(promises)
      await waitForAsync(20)

      const files = await glob(join(testDir, '.config/sanity/telemetry-*.ndjson'))
      expect(files).toHaveLength(1)

      const content = await readFile(files[0], 'utf8')
      expect(content).toBeDefined()

      const events = parseNDJSONContent(content)
      expect(events).toHaveLength(5)

      for (let i = 0; i < 5; i++) {
        const event = events.find((e) => (e as TelemetryLogEvent).name === `concurrent-${i}`)
        expect(event).toBeDefined()
        expect((event as TelemetryLogEvent)!.data).toEqual({index: i})
      }
    })
  })

  describe('Flush Operations with RxJS Streams', () => {
    it('should collect events from all session files', async () => {
      const telemetryDir = join(testDir, '.config', 'sanity')
      mkdirSync(telemetryDir, {recursive: true})

      const hashedToken = createHash('sha256').update(TEST_AUTH_TOKEN).digest('hex').slice(0, 8)
      const files = [
        {
          events: 2,
          path: join(telemetryDir, `telemetry-${hashedToken}-production-session-1.ndjson`),
        },
        {
          events: 3,
          path: join(telemetryDir, `telemetry-${hashedToken}-production-session-2.ndjson`),
        },
        {
          events: 1,
          path: join(telemetryDir, `telemetry-${hashedToken}-production-session-3.ndjson`),
        },
      ]

      for (const file of files) {
        const events = Array.from({length: file.events}, (_, i) =>
          createMockLogEvent({name: `event-${i}`, sessionId: `session-${i + 1}`}),
        )

        await writeFile(file.path, createNDJSONContent(events))
      }

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)
      await store.flush()

      expect(mockSendEvents).toHaveBeenCalledTimes(1)
      const sentEvents = mockSendEvents.mock.calls[0][0]
      expect(sentEvents).toHaveLength(6)

      for (const file of files) {
        expect(existsSync(file.path)).toBe(false)
      }
    })

    it('should handle network errors during flush', async () => {
      const networkError = new Error('Network timeout')
      mockSendEvents.mockRejectedValue(networkError)

      const telemetryDir = join(testDir, '.config', 'sanity')
      mkdirSync(telemetryDir, {recursive: true})

      const hashedToken = createHash('sha256').update(TEST_AUTH_TOKEN).digest('hex').slice(0, 8)
      const filePath = join(telemetryDir, `telemetry-${hashedToken}-production-session-1.ndjson`)
      const events = [createMockLogEvent({sessionId: 'session-1'})]

      await writeFile(filePath, createNDJSONContent(events))

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      await expect(store.flush()).rejects.toThrow('Network timeout')

      expect(existsSync(filePath)).toBe(true)
    })

    it('should handle consent revocation during flush', async () => {
      mockResolveConsent
        .mockResolvedValueOnce(createMockConsent('granted'))
        .mockResolvedValueOnce(createMockConsent('denied'))

      const telemetryDir = join(testDir, '.config', 'sanity')
      mkdirSync(telemetryDir, {recursive: true})

      const hashedToken = createHash('sha256').update(TEST_AUTH_TOKEN).digest('hex').slice(0, 8)
      const filePath = join(telemetryDir, `telemetry-${hashedToken}-production-session-1.ndjson`)
      const events = [createMockLogEvent({sessionId: 'session-1'})]

      await writeFile(filePath, createNDJSONContent(events))

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)
      await store.flush()

      expect(mockSendEvents).not.toHaveBeenCalled()

      expect(existsSync(filePath)).toBe(false)
    })

    it('should handle empty files gracefully', async () => {
      const telemetryDir = join(testDir, '.config', 'sanity')
      mkdirSync(telemetryDir, {recursive: true})

      const hashedToken = createHash('sha256').update(TEST_AUTH_TOKEN).digest('hex').slice(0, 8)
      const filePath = join(telemetryDir, `telemetry-${hashedToken}-production-session-1.ndjson`)

      await writeFile(filePath, '')

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)
      await store.flush()

      expect(mockSendEvents).not.toHaveBeenCalled()

      expect(existsSync(filePath)).toBe(false)
    })

    it('should handle missing files during flush', async () => {
      const telemetryDir = join(testDir, '.config', 'sanity')
      mkdirSync(telemetryDir, {recursive: true})

      const hashedToken = createHash('sha256').update(TEST_AUTH_TOKEN).digest('hex').slice(0, 8)
      const filePath = join(telemetryDir, `telemetry-${hashedToken}-production-session-1.ndjson`)
      const events = [createMockLogEvent({sessionId: 'session-1'})]

      await writeFile(filePath, createNDJSONContent(events))

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      await rm(filePath, {force: true})

      await expect(store.flush()).resolves.not.toThrow()

      expect(mockSendEvents).not.toHaveBeenCalled()
    })
  })

  describe('Store Lifecycle Management', () => {
    it('should flush events when end() is called', async () => {
      const telemetryDir = join(testDir, '.config', 'sanity')
      mkdirSync(telemetryDir, {recursive: true})

      // Create a test file with events
      const hashedToken = createHash('sha256').update(TEST_AUTH_TOKEN).digest('hex').slice(0, 8)
      const filePath = join(telemetryDir, `telemetry-${hashedToken}-production-session-test.ndjson`)
      const events = [createMockLogEvent({sessionId: 'session-test'})]
      await writeFile(filePath, createNDJSONContent(events))

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      // Call end() which should trigger flush
      store.end()

      // Wait for the async flush to complete
      await waitForAsync(200)

      // Verify that sendEvents was called (indicating flush happened)
      expect(mockSendEvents).toHaveBeenCalledTimes(1)
      const sentEvents = mockSendEvents.mock.calls[0][0]
      expect(sentEvents).toHaveLength(1)

      // Verify file was cleaned up
      expect(existsSync(filePath)).toBe(false)
    })

    it('should clean up resources even if flush fails', async () => {
      const flushError = new Error('Network error during flush')
      mockSendEvents.mockRejectedValue(flushError)

      const telemetryDir = join(testDir, '.config', 'sanity')
      mkdirSync(telemetryDir, {recursive: true})

      const hashedToken = createHash('sha256').update(TEST_AUTH_TOKEN).digest('hex').slice(0, 8)
      const filePath = join(telemetryDir, `telemetry-${hashedToken}-production-session-test.ndjson`)
      const events = [createMockLogEvent({sessionId: 'session-test'})]
      await writeFile(filePath, createNDJSONContent(events))

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      // Call end() - should not throw even if flush fails
      expect(() => store.end()).not.toThrow()

      // Wait for the async operations to complete
      await waitForAsync(200)

      // File should still exist since flush failed
      expect(existsSync(filePath)).toBe(true)

      // But the store should have cleaned up its internal resources
      // (This is harder to test directly, but the test verifies no exceptions are thrown)
    })

    it('should handle multiple calls to end() safely', async () => {
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      // Multiple calls to end() should not cause issues
      expect(() => {
        store.end()
        store.end()
        store.end()
      }).not.toThrow()

      await waitForAsync(100)
    })

    it('should return false for endWithBeacon', async () => {
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      // endWithBeacon should return false since we're not in a browser context
      expect(store.endWithBeacon()).toBe(false)
    })
  })

  describe('Logger Integration', () => {
    it('should create functional logger with all methods', async () => {
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      const {logger} = store

      expect(logger.log).toBeInstanceOf(Function)
      logger.log({name: 'test-log', schema: {}, type: 'log', version: 1}, {test: true})

      expect(logger.trace).toBeInstanceOf(Function)
      const trace = logger.trace({
        context: undefined,
        name: 'test-trace',
        schema: {},
        type: 'trace',
        version: 1,
      })
      expect(trace.start).toBeInstanceOf(Function)

      expect(logger.updateUserProperties).toBeInstanceOf(Function)
      logger.updateUserProperties({platform: 'test'})

      await waitForAsync(100)

      const files = await glob(join(testDir, '.config/sanity/telemetry-*.ndjson'))
      expect(files).toHaveLength(1)

      const content = await readFile(files[0], 'utf8')
      expect(content).toBeDefined()

      const events = parseNDJSONContent(content)
      expect(events.length).toBeGreaterThan(0)
    })

    it('should handle sampling correctly', async () => {
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(100)

      const sampledEvent = {
        maxSampleRate: 1000,
        name: 'sampled-event',
        schema: {},
        type: 'log' as const,
        version: 1,
      }
      const {logger} = store

      logger.log(sampledEvent, {count: 1})

      logger.log(sampledEvent, {count: 2})

      await waitForAsync(100)

      const files = await glob(join(testDir, '.config/sanity/telemetry-*.ndjson'))
      expect(files).toHaveLength(1)

      const content = await readFile(files[0], 'utf8')
      expect(content).toBeDefined()

      const events = parseNDJSONContent(content)
      const sampledEvents = events.filter((e) => (e as TelemetryLogEvent).name === 'sampled-event')
      expect(sampledEvents).toHaveLength(1)
      expect((sampledEvents[0] as TelemetryLogEvent).data).toEqual({count: 1})
    })
  })
})
