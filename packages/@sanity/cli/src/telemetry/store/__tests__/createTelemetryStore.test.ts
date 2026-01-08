import {mkdir} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {getCliToken} from '@sanity/cli-core'
import {type TelemetryEvent} from '@sanity/telemetry'
import {glob} from 'tinyglobby'
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

const INIT_DELAY = 50 // Store initialization (async consent + file path)
const ASYNC_OPERATION_DELAY = 50 // Promise resolution in traces
const WAIT_FOR_OPERATIONS = 100 // General async operation wait

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

  const store = createTelemetryStore(sessionId, {
    resolveConsent: mockResolveConsent,
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
    test('should write log and trace events to file and allow external flushing', async () => {
      const sessionId = `test-session-${Date.now()}`
      const store = await setupStore(sessionId)

      const testEvent = createLogEvent('test-event')
      store.logger.log(testEvent, {testData: true})

      const testTrace = createTraceEvent('test-trace')
      const trace = store.logger.trace(testTrace, {traceContext: 'test'})
      trace.start()
      trace.log({step: 'processing'})
      trace.complete()

      const telemetryPath = getTelemetryPath(testDir)
      const filesBeforeEnd = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      expect(filesBeforeEnd).toHaveLength(1)

      const events = await readNDJSON<TelemetryEvent>(filesBeforeEnd[0])
      const eventTypes = events.map((e) => e.type)
      expect(eventTypes).toEqual(['log', 'trace.start', 'trace.log', 'trace.complete'])
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

      // Verify events are written to file immediately (no external flushing needed)
      const traceEvents = events.filter((e) => e.type.startsWith('trace'))
      expect(logEvent).toBeDefined()
      expect(traceEvents).toHaveLength(3) // start, log, complete
    })
  })

  describe('consent handling', () => {
    test('should respect consent when writing events', async () => {
      // Test with consent granted
      const sessionId1 = `test-consent-granted-${Date.now()}`
      mockResolveConsent.mockResolvedValue({status: 'granted'})

      const store1 = createTelemetryStore(sessionId1, {
        resolveConsent: mockResolveConsent,
      })

      await waitForAsync(INIT_DELAY)

      const grantedEvent = createLogEvent('granted-event')
      store1.logger.log(grantedEvent, {consentStatus: 'granted'})

      const expectedPath = join(testDir, '.config', 'sanity')
      const grantedFiles = await glob(join(expectedPath, 'telemetry-*.ndjson'))
      expect(grantedFiles).toHaveLength(1)

      const grantedEvents = await readNDJSON<TelemetryEvent>(grantedFiles[0])
      expect(grantedEvents).toHaveLength(1)
      expect(grantedEvents[0]).toMatchObject({
        data: {consentStatus: 'granted'},
        name: 'granted-event',
        type: 'log',
      })

      // Test with consent denied
      const sessionId2 = `test-consent-denied-${Date.now()}`
      mockResolveConsent.mockResolvedValue({status: 'denied'})

      const store2 = createTelemetryStore(sessionId2, {
        resolveConsent: mockResolveConsent,
      })

      await waitForAsync(INIT_DELAY)

      const deniedEvent = createLogEvent('denied-event')
      store2.logger.log(deniedEvent, {consentStatus: 'denied'})

      // No new files should be created when consent is denied
      const finalFiles = await glob(join(expectedPath, 'telemetry-*.ndjson'))
      expect(finalFiles).toHaveLength(1) // Still only the granted file
    })

    test('should handle initialization failures without crashing', async () => {
      mockResolveConsent
        .mockRejectedValueOnce(new Error('Consent service unavailable'))
        .mockResolvedValue({status: 'granted'})

      const sessionId = `test-init-failure-${Date.now()}`
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
      })

      await waitForAsync(WAIT_FOR_OPERATIONS)

      const testEvent = createLogEvent('init-failure-event')
      store.logger.log(testEvent, {initTest: true})

      await waitForAsync(WAIT_FOR_OPERATIONS)

      const expectedPath = join(testDir, '.config', 'sanity')
      const filesAfterInitFailure = await glob(join(expectedPath, 'telemetry-*.ndjson'))

      // After initialization failure, no events should be written
      expect(filesAfterInitFailure).toHaveLength(0)
    })
  })

  describe('file management', () => {
    test('should create separate files for multiple sessions', async () => {
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

      const telemetryPath = getTelemetryPath(testDir)
      const sessionFiles = await glob(join(telemetryPath, 'telemetry-*.ndjson'))

      // Verify each session created its own file
      expect(sessionFiles).toHaveLength(2)

      // Verify the content of each file
      const [file1, file2] = sessionFiles
      const events1 = await readNDJSON<TelemetryEvent>(file1)
      const events2 = await readNDJSON<TelemetryEvent>(file2)

      // One file should have 3 trace events, the other should have 1 log event
      const traceFileEvents = events1.length === 3 ? events1 : events2
      const logFileEvents = events1.length === 1 ? events1 : events2

      expect(traceFileEvents).toHaveLength(3) // trace.start, trace.log, trace.complete
      expect(logFileEvents).toHaveLength(1) // single log event

      verifyEventData(traceFileEvents, [
        {type: 'trace.start'},
        {type: 'trace.log'},
        {type: 'trace.complete'},
      ])
      verifyEventData(logFileEvents, [
        {
          data: {data: 'test2', session: 2},
          type: 'log',
        },
      ])
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

      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      const events = await readNDJSON<TelemetryEvent>(files[0])
      const eventTypes = events.map((e) => e.type)
      expect(eventTypes).toEqual(['trace.start', 'trace.log', 'trace.log', 'trace.complete'])

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

      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      const events = await readNDJSON<TelemetryEvent>(files[0])
      const eventTypes = events.map((e) => e.type)
      expect(eventTypes).toEqual(['trace.start', 'trace.log', 'trace.complete'])
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

      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      const events = await readNDJSON<TelemetryEvent>(files[0])
      const eventTypes = events.map((e) => e.type)
      expect(eventTypes).toEqual(['trace.start', 'trace.error'])
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

      const telemetryPath = getTelemetryPath(testDir)
      const files = await glob(join(telemetryPath, 'telemetry-*.ndjson'))
      const events = await readNDJSON<TelemetryEvent>(files[0])
      const eventTypes = events.map((e) => e.type)
      expect(eventTypes).toEqual(['trace.start', 'log', 'trace.complete'])

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
})
