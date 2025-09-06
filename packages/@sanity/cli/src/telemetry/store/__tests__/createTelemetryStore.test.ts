import {mkdir, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {getCliToken} from '@sanity/cli-core'
import {type TelemetryEvent} from '@sanity/telemetry'
import {glob} from 'glob'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

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

// Timing constants
const INIT_DELAY = 50 // Store initialization
const WRITE_DELAY = 50 // File write operations
const FLUSH_DELAY = 200 // Flush completion

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

  it('should handle store lifecycle with log and trace events, then flush on end', async () => {
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

    const events = await readNDJSON<TelemetryEvent>(filesBeforeEnd[0])
    expect(events).toHaveLength(4) // 1 log + 3 trace events

    const eventTypes = events.map((e) => e.type)
    expect(eventTypes).toEqual(['log', 'trace.start', 'trace.log', 'trace.complete'])

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

    const filesAfterEnd = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
    expect(filesAfterEnd).toHaveLength(0)
  })

  it('should handle consent lifecycle and revocation correctly', async () => {
    const sessionId = `test-consent-lifecycle-${Date.now()}`
    let consentResolveCount = 0

    mockResolveConsent.mockImplementation(() => {
      consentResolveCount++
      if (consentResolveCount === 1) {
        return Promise.resolve({status: 'granted'})
      }
      return Promise.resolve({reason: 'revoked', status: 'denied'})
    })
    mockSendEvents.mockResolvedValue(undefined)

    const store = createTelemetryStore(sessionId, {
      resolveConsent: mockResolveConsent,
      sendEvents: mockSendEvents,
    })

    await waitForAsync(100)

    const testEvent1 = {
      name: 'test-event-1',
      schema: {},
      type: 'log' as const,
      version: 1,
    }
    store.logger.log(testEvent1, {beforeRevoke: true})

    await waitForAsync(100)

    const expectedPath = join(testDir, '.config', 'sanity')
    const filesAfterFirstEvent = await glob(join(expectedPath, 'telemetry-*.ndjson'))
    expect(filesAfterFirstEvent).toHaveLength(1)

    const eventsAfterFirst = await readNDJSON<TelemetryEvent>(filesAfterFirstEvent[0])
    expect(eventsAfterFirst).toHaveLength(1)
    expect(eventsAfterFirst[0]).toMatchObject({
      data: {beforeRevoke: true},
      name: 'test-event-1',
      sessionId,
      type: 'log',
    })

    const testEvent2 = {
      name: 'test-event-2',
      schema: {},
      type: 'log' as const,
      version: 1,
    }
    store.logger.log(testEvent2, {afterRevoke: true})

    await waitForAsync(100)

    await store.flush()

    expect(mockResolveConsent).toHaveBeenCalledTimes(2)
    expect(mockSendEvents).not.toHaveBeenCalled()

    const filesAfterFlush = await glob(join(expectedPath, 'telemetry-*.ndjson'))
    expect(filesAfterFlush).toHaveLength(0)
  })

  it('should aggregate events from multiple concurrent sessions', async () => {
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

    expect(session1Events.map((e) => e.type)).toEqual([
      'trace.start',
      'trace.log',
      'trace.complete',
    ])
    expect(session2Events[0]).toMatchObject({
      data: {data: 'test2', session: 2},
      type: 'log',
    })

    // Verify corrupted file was skipped (only corrupted file remains)
    const filesAfterFlush = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
    expect(filesAfterFlush).toHaveLength(1)
  })

  it('should preserve files on network error and successfully retry', async () => {
    const sessionId = `test-network-error-${Date.now()}`

    let sendAttempts = 0
    mockResolveConsent.mockResolvedValue({status: 'granted'})
    mockSendEvents.mockImplementation(() => {
      sendAttempts++
      if (sendAttempts === 1) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve()
    })

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

    const eventsBeforeRetry = await readNDJSON<TelemetryEvent>(filesAfterFailedFlush[0])
    expect(eventsBeforeRetry).toHaveLength(3) // trace.start, trace.log, trace.error

    const eventTypes = eventsBeforeRetry.map((e) => e.type)
    expect(eventTypes).toEqual(['trace.start', 'trace.log', 'trace.error'])

    const traceError = eventsBeforeRetry.find((e) => e.type === 'trace.error')
    expect((traceError as {data: {message: string}}).data.message).toBe('Network connection failed')

    await store.flush()

    expect(mockSendEvents).toHaveBeenCalledTimes(2)
    const retryCall = mockSendEvents.mock.calls[1][0] as TelemetryEvent[]
    expect(retryCall).toHaveLength(3)

    const retryEventTypes = retryCall.map((e) => e.type)
    expect(retryEventTypes).toEqual(['trace.start', 'trace.log', 'trace.error'])

    const filesAfterSuccessfulRetry = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
    expect(filesAfterSuccessfulRetry).toHaveLength(0)
  })

  it('should handle initialization failures without crashing', async () => {
    let consentCallCount = 0
    mockResolveConsent.mockImplementation(() => {
      consentCallCount++
      if (consentCallCount === 1) {
        return Promise.reject(new Error('Consent service unavailable'))
      }
      return Promise.resolve({status: 'granted'})
    })

    mockSendEvents.mockResolvedValue(undefined)

    const sessionId = `test-init-failure-${Date.now()}`
    const store = createTelemetryStore(sessionId, {
      resolveConsent: mockResolveConsent,
      sendEvents: mockSendEvents,
    })

    await waitForAsync(100)

    const testEvent = {
      name: 'test-event-after-init-failure',
      schema: {},
      type: 'log' as const,
      version: 1,
    }
    store.logger.log(testEvent, {initTest: true})

    await waitForAsync(100)

    const expectedPath = join(testDir, '.config', 'sanity')
    const filesAfterInitFailure = await glob(join(expectedPath, 'telemetry-*.ndjson'))

    if (filesAfterInitFailure.length > 0) {
      const events = await readNDJSON<TelemetryEvent>(filesAfterInitFailure[0])
      expect(events).toHaveLength(0)
    }

    await store.flush()

    expect(mockResolveConsent).toHaveBeenCalledTimes(2)
    expect(mockSendEvents).not.toHaveBeenCalled()

    const filesAfterFlush = await glob(join(expectedPath, 'telemetry-*.ndjson'))
    expect(filesAfterFlush).toHaveLength(0)
  })

  it('should handle empty state and mixed file scenarios', async () => {
    mockResolveConsent.mockResolvedValue({status: 'granted'})
    mockSendEvents.mockResolvedValue(undefined)

    const sessionId = `test-edge-cases-${Date.now()}`
    const store = createTelemetryStore(sessionId, {
      resolveConsent: mockResolveConsent,
      sendEvents: mockSendEvents,
    })

    await waitForAsync(50)

    await store.flush()

    expect(mockSendEvents).not.toHaveBeenCalled()

    const testEvent = {
      name: 'edge-case-event',
      schema: {},
      type: 'log' as const,
      version: 1,
    }
    store.logger.log(testEvent, {edgeTest: true})

    await waitForAsync(100)

    const expectedPath = join(testDir, '.config', 'sanity')

    const emptyFilePath = join(expectedPath, `telemetry-empty-${Date.now()}.ndjson`)
    await writeFile(emptyFilePath, '')

    await store.flush()

    expect(mockSendEvents).toHaveBeenCalledTimes(1)
    expect(mockSendEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        data: {edgeTest: true},
        sessionId,
      }),
    ])

    const filesAfterFinalFlush = await glob(join(expectedPath, 'telemetry-*.ndjson'))
    expect(filesAfterFinalFlush.length).toBeLessThanOrEqual(1)
  })

  it('should handle complete trace lifecycle with promises, contexts, and sampling', async () => {
    const sessionId = `test-trace-comprehensive-${Date.now()}`
    const store = await setupStore(sessionId)

    // Test 1: Complete trace lifecycle
    const lifecycleTrace = createTraceEvent('lifecycle-trace')
    const trace = store.logger.trace(lifecycleTrace, {traceContext: 'lifecycle'})

    trace.start()
    trace.log({action: 'initialize', step: 1})
    trace.log({action: 'process', step: 2})
    trace.complete()

    // Test that completed traces ignore further events
    trace.log({action: 'ignored', step: 3})
    trace.error(new Error('Should be ignored'))

    // Test 2: updateUserProperties
    store.logger.updateUserProperties({plan: 'pro', userId: 'test-user-123'})

    // Test 3: trace.await with successful promise
    const asyncTrace = createTraceEvent('async-operation')
    const asyncTraceInstance = store.logger.trace(asyncTrace)

    const asyncOperation = new Promise<string>((resolve) => {
      setTimeout(() => resolve('success'), 50)
    })

    const result = await asyncTraceInstance.await(asyncOperation, {operation: 'async-complete'})
    expect(result).toBe('success')

    // Test 4: trace.await with failing promise
    const failTrace = createTraceEvent('fail-operation')
    const failingTrace = store.logger.trace(failTrace)

    const failingOperation = new Promise<object>((_, reject) => {
      setTimeout(() => reject(new Error('Operation failed')), 50)
    })

    await expect(failingTrace.await(failingOperation)).rejects.toThrow('Operation failed')

    // Test 5: Nested contexts
    const parentTrace = createTraceEvent('parent-operation')
    const parentTraceInstance = store.logger.trace(parentTrace, {level: 'parent'})
    parentTraceInstance.start()

    const childLogger = parentTraceInstance.newContext('child-operation')
    const childLogEvent = createLogEvent('child-log')
    childLogger.log(childLogEvent, {childData: true})

    parentTraceInstance.complete()

    // Test 6: Sampling behavior
    const sampledEvent = {
      maxSampleRate: 1000, // 1 second sampling
      name: 'sampled-event',
      schema: {},
      type: 'log' as const,
      version: 1,
    }

    store.logger.log(sampledEvent, {attempt: 1}) // Should go through
    store.logger.log(sampledEvent, {attempt: 2}) // Should be blocked

    await waitForAsync(WRITE_DELAY)

    const telemetryPath = getTelemetryPath(testDir)
    const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
    expect(files).toHaveLength(1)

    const events = await readNDJSON<TelemetryEvent>(files[0])

    // Verify all event types are present
    const eventTypes = events.map((e) => e.type)
    expect(eventTypes).toContain('trace.start')
    expect(eventTypes).toContain('trace.log')
    expect(eventTypes).toContain('trace.complete')
    expect(eventTypes).toContain('trace.error')
    expect(eventTypes).toContain('userProperties')
    expect(eventTypes).toContain('log')

    // Verify sampling worked (only one sampled event)
    const sampledEvents = events.filter((e) => 'name' in e && e.name === 'sampled-event')
    expect(sampledEvents).toHaveLength(1)
    expect((sampledEvents[0] as {data: {attempt: number}}).data?.attempt).toBe(1)

    // Verify trace lifecycle events are properly ignored after completion
    const lifecycleEvents = events.filter((e) => 'name' in e && e.name === 'lifecycle-trace')
    expect(lifecycleEvents).toHaveLength(4) // start + 2 logs + complete (ignored events not present)

    await store.flush()

    expect(mockSendEvents).toHaveBeenCalledTimes(1)
    const sentEvents = mockSendEvents.mock.calls[0][0] as TelemetryEvent[]

    const sentEventTypes = sentEvents.map((e) => e.type)
    expect(sentEventTypes).toEqual(
      expect.arrayContaining([
        'trace.start',
        'trace.log',
        'trace.complete',
        'trace.error',
        'userProperties',
        'log',
      ]),
    )
  })
})
