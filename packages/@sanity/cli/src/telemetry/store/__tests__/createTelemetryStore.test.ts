import {mkdir, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {getCliToken} from '@sanity/cli-core'
import {type TelemetryEvent} from '@sanity/telemetry'
import {glob} from 'glob'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {readNDJSON} from '../../utils/readNDJSON.js'
import {createTelemetryStore} from '../createTelemetryStore.js'

vi.mock('node:os', () => ({homedir: vi.fn()}))
vi.mock('@sanity/cli-core', async () => ({
  ...(await vi.importActual('@sanity/cli-core')),
  getCliToken: vi.fn(),
}))

const waitForAsync = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const mockGetCliToken = vi.mocked(getCliToken)
const mockHomedir = vi.mocked(homedir)
const mockResolveConsent = vi.fn()
const mockSendEvents = vi.fn()

const INIT_DELAY = 50 // Store initialization
const WRITE_DELAY = 50 // File write operations
const FLUSH_DELAY = 200 // Flush completion
const ASYNC_OPERATION_DELAY = 50 // Promise resolution in traces
const WAIT_FOR_OPERATIONS = 100 // General async operation wait

const verifyEventTypes = async (filePath: string, expectedTypes: string[]) => {
  const events = await readNDJSON<TelemetryEvent>(filePath)
  const types = events.map((e) => e.type)
  expect(types).toEqual(expectedTypes)
  return events
}

const verifyFilesCleanedUp = async (telemetryPath: string) => {
  const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
  expect(files).toHaveLength(0)
}

const verifyEventData = (
  events: TelemetryEvent[],
  expectedData: Array<{[key: string]: unknown; type: string}>,
) => {
  expect(events).toEqual(expectedData.map((data) => expect.objectContaining(data)))
}

const createLogEvent = (name: string) => ({
  name,
  schema: {},
  type: 'log' as const,
  version: 1,
})

const createTraceEvent = (name: string) => ({
  context: undefined,
  name,
  schema: {},
  type: 'trace' as const,
  version: 1,
})

const getTelemetryPath = (testDir: string) => join(testDir, '.config', 'sanity')

const setupStore = async (
  sessionId: string,
  consentStatus: 'denied' | 'granted' | 'undetermined' = 'granted',
) => {
  mockResolveConsent.mockResolvedValue({status: consentStatus})
  mockSendEvents.mockResolvedValue(undefined)

  const store = createTelemetryStore(sessionId, {
    resolveConsent: mockResolveConsent,
    sendEvents: mockSendEvents,
  })

  await waitForAsync(INIT_DELAY)
  return store
}

describe('#createTelemetryStore', () => {
  let testDir: string

  beforeEach(async () => {
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(7)
    testDir = join(process.cwd(), 'tmp', 'telemetry-tests', `test-${timestamp}-${random}`)
    await mkdir(testDir, {recursive: true})

    mockHomedir.mockReturnValue(testDir)
    mockGetCliToken.mockResolvedValue('test-auth-token-123')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('basic functionality', () => {
    test('should write log and trace events to file, flush on end, and clean up files', async () => {
      const sessionId = `test-session-${Date.now()}`
      const store = await setupStore(sessionId)

      const testEvent = createLogEvent('test-event')
      store.logger.log(testEvent, {testData: true})

      const testTrace = createTraceEvent('test-trace')
      const trace = store.logger.trace(testTrace, {traceContext: 'test'})
      trace.start()
      trace.log({step: 'processing'})
      trace.complete()

      await waitForAsync(WRITE_DELAY)

      const telemetryPath = getTelemetryPath(testDir)
      const filesBeforeEnd = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      expect(filesBeforeEnd).toHaveLength(1)

      const events = await verifyEventTypes(filesBeforeEnd[0], [
        'log',
        'trace.start',
        'trace.log',
        'trace.complete',
      ])
      expect(events).toHaveLength(4) // 1 log + 3 trace events

      const logEvent = events.find((e) => e.type === 'log')
      expect(logEvent?.data).toEqual({testData: true})
      expect(logEvent?.name).toBe('test-event')

      const traceStart = events.find((e) => e.type === 'trace.start')
      expect(traceStart).toMatchObject({
        context: {traceContext: 'test'},
        name: 'test-trace',
        sessionId,
      })

      store.end()
      await waitForAsync(FLUSH_DELAY)

      expect(mockSendEvents).toHaveBeenCalledTimes(1)
      const sentEvents = mockSendEvents.mock.calls[0][0] as TelemetryEvent[]
      expect(sentEvents).toHaveLength(4)

      // Verify all event types were sent
      const sentEventTypes = sentEvents.map((e) => e.type)
      expect(sentEventTypes).toEqual(
        expect.arrayContaining(['log', 'trace.start', 'trace.log', 'trace.complete']),
      )

      await verifyFilesCleanedUp(telemetryPath)
    })
  })

  describe('consent handling', () => {
    test('should handle consent lifecycle and revocation correctly', async () => {
      const sessionId = `test-consent-lifecycle-${Date.now()}`
      mockResolveConsent
        .mockResolvedValueOnce({status: 'granted'})
        .mockResolvedValue({reason: 'revoked', status: 'denied'})
      mockSendEvents.mockResolvedValue(undefined)

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(WAIT_FOR_OPERATIONS)

      const testEvent1 = createLogEvent('consent-granted-event')
      store.logger.log(testEvent1, {beforeRevoke: true})

      await waitForAsync(WAIT_FOR_OPERATIONS)

      const expectedPath = join(testDir, '.config', 'sanity')
      const filesAfterFirstEvent = await glob(join(expectedPath, 'telemetry-*.ndjson'))
      expect(filesAfterFirstEvent).toHaveLength(1)

      const eventsAfterFirst = await readNDJSON<TelemetryEvent>(filesAfterFirstEvent[0])
      verifyEventData(eventsAfterFirst, [
        {
          data: {beforeRevoke: true},
          name: 'consent-granted-event',
          sessionId,
          type: 'log',
        },
      ])

      const testEvent2 = createLogEvent('consent-revoked-event')
      store.logger.log(testEvent2, {afterRevoke: true})

      await waitForAsync(WAIT_FOR_OPERATIONS)

      await store.flush()

      expect(mockResolveConsent).toHaveBeenCalledTimes(2)
      expect(mockSendEvents).not.toHaveBeenCalled()

      await verifyFilesCleanedUp(expectedPath)
    })

    test('should handle initialization failures without crashing', async () => {
      mockResolveConsent
        .mockRejectedValueOnce(new Error('Consent service unavailable'))
        .mockResolvedValue({status: 'granted'})

      mockSendEvents.mockResolvedValue(undefined)

      const sessionId = `test-init-failure-${Date.now()}`
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(WAIT_FOR_OPERATIONS)

      const testEvent = createLogEvent('init-failure-event')
      store.logger.log(testEvent, {initTest: true})

      await waitForAsync(WAIT_FOR_OPERATIONS)

      const expectedPath = join(testDir, '.config', 'sanity')
      const filesAfterInitFailure = await glob(join(expectedPath, 'telemetry-*.ndjson'))

      if (filesAfterInitFailure.length > 0) {
        const events = await readNDJSON<TelemetryEvent>(filesAfterInitFailure[0])
        expect(events).toHaveLength(0)
      }

      await store.flush()

      expect(mockResolveConsent).toHaveBeenCalledTimes(2)
      expect(mockSendEvents).not.toHaveBeenCalled()

      await verifyFilesCleanedUp(expectedPath)
    })
  })

  describe('file management', () => {
    test('should aggregate events from multiple sessions and skip corrupted files', async () => {
      const sessionId1 = `test-session-1-${Date.now()}`
      const sessionId2 = `test-session-2-${Date.now()}`

      const store1 = await setupStore(sessionId1)
      const store2 = await setupStore(sessionId2)

      // Session 1 uses trace
      const traceEvent = createTraceEvent('trace-event-1')
      const trace1 = store1.logger.trace(traceEvent, {session: 1})
      trace1.start()
      trace1.log({data: 'test1', session: 1})
      trace1.complete()

      // Session 2 uses log
      const logEvent = createLogEvent('event-2')
      store2.logger.log(logEvent, {data: 'test2', session: 2})

      await waitForAsync(WRITE_DELAY)

      const telemetryPath = getTelemetryPath(testDir)
      const filesBeforeCorruption = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      expect(filesBeforeCorruption).toHaveLength(2)

      // Add corrupted file to test error handling
      const corruptedFilePath = join(telemetryPath, 'telemetry-corrupted-test.ndjson')
      await writeFile(corruptedFilePath, '{"invalid": json}\n{"valid": "json"}\n')

      await store1.flush()

      expect(mockSendEvents).toHaveBeenCalledTimes(1)
      const sentEvents = mockSendEvents.mock.calls[0][0] as TelemetryEvent[]
      expect(sentEvents).toHaveLength(4) // 3 trace events + 1 log event

      // Group events by session for cleaner assertions
      const session1Events = sentEvents.filter((e) => e.sessionId === sessionId1)
      const session2Events = sentEvents.filter((e) => e.sessionId === sessionId2)

      expect(session1Events).toHaveLength(3) // trace events
      expect(session2Events).toHaveLength(1) // log event

      verifyEventData(session1Events, [
        {type: 'trace.start'},
        {type: 'trace.log'},
        {type: 'trace.complete'},
      ])
      verifyEventData(session2Events, [
        {
          data: {data: 'test2', session: 2},
          type: 'log',
        },
      ])

      // Verify corrupted file was skipped (only corrupted file remains)
      const filesAfterFlush = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      expect(filesAfterFlush).toHaveLength(1)
    })

    test('should handle flush with no events and clean up empty files', async () => {
      mockResolveConsent.mockResolvedValue({status: 'granted'})
      mockSendEvents.mockResolvedValue(undefined)

      const sessionId = `test-edge-cases-${Date.now()}`
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(INIT_DELAY)

      await store.flush()

      expect(mockSendEvents).not.toHaveBeenCalled()

      const testEvent = createLogEvent('post-end-event')
      store.logger.log(testEvent, {edgeTest: true})

      await waitForAsync(WAIT_FOR_OPERATIONS)

      const expectedPath = join(testDir, '.config', 'sanity')

      const emptyFilePath = join(expectedPath, `telemetry-empty-${Date.now()}.ndjson`)
      await writeFile(emptyFilePath, '')

      await store.flush()

      expect(mockSendEvents).toHaveBeenCalledTimes(1)
      expect(mockSendEvents).toHaveBeenCalledWith([
        expect.objectContaining({
          data: {edgeTest: true},
          name: 'post-end-event',
          sessionId,
          type: 'log',
        }),
      ])

      const filesAfterFinalFlush = await glob(join(expectedPath, 'telemetry-*.ndjson'))
      expect(filesAfterFinalFlush.length).toBeLessThanOrEqual(1)
    })
  })

  describe('error recovery', () => {
    test('should preserve files on network error and successfully retry', async () => {
      const sessionId = `test-network-error-${Date.now()}`

      mockResolveConsent.mockResolvedValue({status: 'granted'})
      mockSendEvents.mockRejectedValueOnce(new Error('Network error')).mockResolvedValue(undefined)

      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await waitForAsync(INIT_DELAY)

      // Use trace with error simulation
      const testTrace = createTraceEvent('network-trace')
      const trace = store.logger.trace(testTrace)
      trace.start()
      trace.log({operation: 'network-request'})

      // Simulate an error in the trace
      const networkError = new Error('Network connection failed')
      trace.error(networkError)

      await waitForAsync(WRITE_DELAY)

      const telemetryPath = getTelemetryPath(testDir)

      await expect(store.flush()).rejects.toThrow('Network error')

      expect(mockSendEvents).toHaveBeenCalledTimes(1)

      const filesAfterFailedFlush = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      expect(filesAfterFailedFlush).toHaveLength(1)

      const eventsBeforeRetry = await verifyEventTypes(filesAfterFailedFlush[0], [
        'trace.start',
        'trace.log',
        'trace.error',
      ])
      expect(eventsBeforeRetry).toHaveLength(3) // trace.start, trace.log, trace.error

      const traceError = eventsBeforeRetry.find((e) => e.type === 'trace.error')
      expect((traceError as {data: {message: string}}).data.message).toBe(
        'Network connection failed',
      )

      await store.flush()

      expect(mockSendEvents).toHaveBeenCalledTimes(2)
      const retryCall = mockSendEvents.mock.calls[1][0] as TelemetryEvent[]
      expect(retryCall).toHaveLength(3)

      verifyEventData(retryCall, [
        {type: 'trace.start'},
        {type: 'trace.log'},
        {type: 'trace.error'},
      ])

      await verifyFilesCleanedUp(telemetryPath)
    })
  })

  describe('trace functionality', () => {
    test('should handle complete trace lifecycle with start, log, and complete', async () => {
      const sessionId = `test-trace-lifecycle-${Date.now()}`
      const store = await setupStore(sessionId)

      const lifecycleTrace = createTraceEvent('lifecycle-trace')
      const trace = store.logger.trace(lifecycleTrace, {traceContext: 'lifecycle'})

      trace.start()
      trace.log({action: 'initialize', step: 1})
      trace.log({action: 'process', step: 2})
      trace.complete()

      // Test that completed traces ignore further events
      trace.log({action: 'ignored', step: 3})
      trace.error(new Error('Should be ignored'))

      await waitForAsync(WRITE_DELAY)

      const telemetryPath = getTelemetryPath(testDir)
      const events = await verifyEventTypes(
        (await glob(join(telemetryPath, 'telemetry-*.ndjson')))[0],
        ['trace.start', 'trace.log', 'trace.log', 'trace.complete'],
      )

      // Verify trace lifecycle events are properly ignored after completion
      expect(events).toHaveLength(4) // start + 2 logs + complete (ignored events not present)

      const traceStart = events.find((e) => e.type === 'trace.start')
      expect(traceStart).toMatchObject({
        context: {traceContext: 'lifecycle'},
        name: 'lifecycle-trace',
      })
    })

    test('should handle trace.await with successful promises', async () => {
      const sessionId = `test-trace-await-success-${Date.now()}`
      const store = await setupStore(sessionId)

      const asyncTrace = createTraceEvent('async-operation')
      const asyncTraceInstance = store.logger.trace(asyncTrace)

      const asyncOperation = new Promise<string>((resolve) => {
        setTimeout(() => resolve('success'), ASYNC_OPERATION_DELAY)
      })

      const result = await asyncTraceInstance.await(asyncOperation, {operation: 'async-complete'})
      expect(result).toBe('success')

      await waitForAsync(WRITE_DELAY)

      const telemetryPath = getTelemetryPath(testDir)
      await verifyEventTypes((await glob(join(telemetryPath, 'telemetry-*.ndjson')))[0], [
        'trace.start',
        'trace.log',
        'trace.complete',
      ])
    })

    test('should handle trace.await with failing promises', async () => {
      const sessionId = `test-trace-await-failure-${Date.now()}`
      const store = await setupStore(sessionId)

      const failTrace = createTraceEvent('fail-operation')
      const failingTrace = store.logger.trace(failTrace)

      const failingOperation = new Promise<object>((_, reject) => {
        setTimeout(() => reject(new Error('Operation failed')), ASYNC_OPERATION_DELAY)
      })

      await expect(failingTrace.await(failingOperation)).rejects.toThrow('Operation failed')

      await waitForAsync(WRITE_DELAY)

      const telemetryPath = getTelemetryPath(testDir)
      await verifyEventTypes((await glob(join(telemetryPath, 'telemetry-*.ndjson')))[0], [
        'trace.start',
        'trace.error',
      ])
    })

    test('should support nested trace contexts', async () => {
      const sessionId = `test-trace-contexts-${Date.now()}`
      const store = await setupStore(sessionId)

      const parentTrace = createTraceEvent('parent-operation')
      const parentTraceInstance = store.logger.trace(parentTrace, {level: 'parent'})
      parentTraceInstance.start()

      const childLogger = parentTraceInstance.newContext('child-operation')
      const childLogEvent = createLogEvent('child-log')
      childLogger.log(childLogEvent, {childData: true})

      parentTraceInstance.complete()

      await waitForAsync(WRITE_DELAY)

      const telemetryPath = getTelemetryPath(testDir)
      const events = await verifyEventTypes(
        (await glob(join(telemetryPath, 'telemetry-*.ndjson')))[0],
        ['trace.start', 'log', 'trace.complete'],
      )

      const childLog = events.find((e) => e.type === 'log')
      expect(childLog).toMatchObject({
        data: {childData: true},
        name: 'child-log',
      })
    })

    test('should respect sampling rate for events and update user properties', async () => {
      const sessionId = `test-sampling-userprops-${Date.now()}`
      const store = await setupStore(sessionId)

      // Test updateUserProperties
      store.logger.updateUserProperties({plan: 'pro', userId: 'test-user-123'})

      // Test sampling behavior
      const sampledEvent = {
        maxSampleRate: 1000, // 1 second sampling
        name: 'sampled-event',
        schema: {},
        type: 'log' as const,
        version: 1,
      }

      store.logger.log(sampledEvent, {attempt: 1}) // Should go through
      store.logger.log(sampledEvent, {attempt: 2}) // Should be blocked by sampling

      await waitForAsync(WRITE_DELAY)

      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      expect(files).toHaveLength(1)

      const events = await readNDJSON<TelemetryEvent>(files[0])

      // Verify sampling worked (only one sampled event)
      const sampledEvents = events.filter((e) => 'name' in e && e.name === 'sampled-event')
      expect(sampledEvents).toHaveLength(1)
      expect((sampledEvents[0] as {data: {attempt: number}}).data?.attempt).toBe(1)

      // Verify user properties event exists
      const userPropsEvent = events.find((e) => e.type === 'userProperties')
      expect(userPropsEvent).toBeDefined()
    })
  })

  describe('concurrent operations', () => {
    test('should handle concurrent flush calls safely', async () => {
      const sessionId = `test-concurrent-flush-${Date.now()}`
      const store = await setupStore(sessionId)

      // Add multiple events
      const events = [
        createLogEvent('concurrent-1'),
        createLogEvent('concurrent-2'),
        createLogEvent('concurrent-3'),
      ]

      for (const [index, event] of events.entries()) {
        store.logger.log(event, {eventNumber: index + 1})
      }

      await waitForAsync(WRITE_DELAY)

      // Call flush multiple times concurrently
      const flushPromises = [store.flush(), store.flush(), store.flush()]

      // All flush operations should complete without throwing
      await expect(Promise.all(flushPromises)).resolves.not.toThrow()

      // Multiple flush calls may result in multiple send calls, but that's acceptable
      // The important thing is that it doesn't crash and events are sent
      expect(mockSendEvents).toHaveBeenCalled()

      // Verify all files are cleaned up eventually
      const telemetryPath = getTelemetryPath(testDir)
      await verifyFilesCleanedUp(telemetryPath)
    })

    test('should gracefully handle operations after store end', async () => {
      const sessionId = `test-post-end-${Date.now()}`
      const store = await setupStore(sessionId)

      // Add an event before ending
      const beforeEndEvent = createLogEvent('before-end')
      store.logger.log(beforeEndEvent, {timing: 'before'})

      await waitForAsync(WRITE_DELAY)

      // End the store
      store.end()
      await waitForAsync(FLUSH_DELAY)

      // Try to emit events after end - should not throw
      const afterEndEvent = createLogEvent('after-end')
      expect(() => {
        store.logger.log(afterEndEvent, {timing: 'after'})
      }).not.toThrow()

      // Try to call flush after end - should not throw
      await expect(store.flush()).resolves.not.toThrow()

      // The before-end event should have been sent during end()
      expect(mockSendEvents).toHaveBeenCalled()

      // Create a trace after end - should not crash
      const afterEndTrace = createTraceEvent('after-end-trace')
      const trace = store.logger.trace(afterEndTrace)
      expect(() => {
        trace.start()
        trace.log({message: 'after end'})
        trace.complete()
      }).not.toThrow()

      // No unhandled promise rejections should occur
      await waitForAsync(WAIT_FOR_OPERATIONS)
    })
  })
})
