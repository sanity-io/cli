import {readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {type DefinedTelemetryLog, type DefinedTelemetryTrace, type TelemetryEvent} from '@sanity/telemetry'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {type ConsentInformation} from '../../actions/telemetry/types.js'
import {createTelemetryStore} from '../store/createTelemetryStore.js'

describe('createTelemetryStore', () => {
  let mockSendEvents: ReturnType<typeof vi.fn>
  let mockResolveConsent: ReturnType<typeof vi.fn>
  let testFilePath: string

  beforeEach(() => {
    mockSendEvents = vi.fn().mockResolvedValue(undefined)
    mockResolveConsent = vi.fn().mockResolvedValue({status: 'granted'} as ConsentInformation)
    // Mock the environment token
    process.env.SANITY_AUTH_TOKEN = 'test-auth-token'
    // Create unique test file path
    testFilePath = join(tmpdir(), `telemetry-test-${Date.now()}-${Math.random()}.ndjson`)
  })

  afterEach(() => {
    delete process.env.SANITY_AUTH_TOKEN
    vi.clearAllMocks()
  })

  it('should create a telemetry store with basic functionality', async () => {
    const sessionId = 'test-session-123'
    const store = createTelemetryStore(sessionId, {
      resolveConsent: mockResolveConsent,
      sendEvents: mockSendEvents,
    })

    expect(store).toBeDefined()
    expect(store.logger).toBeDefined()
    expect(typeof store.flush).toBe('function')
    expect(typeof store.end).toBe('function')
    expect(typeof store.endWithBeacon).toBe('function')

    store.end()
  })

  describe('logger.log', () => {
    const mockEventDefinition: DefinedTelemetryLog<{prop: string}> = {
      description: 'Test event',
      name: 'test-event',
      schema: undefined as any,
      type: 'log',
      version: 1,
    }

    it('should log events and flush them via sendEvents', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      // Wait for consent initialization
      await new Promise(resolve => setTimeout(resolve, 100))

      store.logger.log(mockEventDefinition, {prop: 'value'})
      
      // Wait for file write to complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      await store.flush()

      expect(mockSendEvents).toHaveBeenCalledTimes(1)
      const sentEvents = mockSendEvents.mock.calls[0][0] as TelemetryEvent[]
      
      expect(sentEvents).toHaveLength(1)
      
      const event = sentEvents[0]
      expect(event.type).toBe('log')
      expect(event.sessionId).toBe(sessionId)
      expect(event.createdAt).toBeDefined()
      
      if (event.type === 'log') {
        expect(event.name).toBe('test-event')
        expect(event.version).toBe(1)
        expect(event.data).toEqual({prop: 'value'})
      }

      store.end()
    })

    it.skip('should handle events with no data', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const voidEvent: DefinedTelemetryLog<void> = {
        name: 'void-event',
        schema: undefined as any,
        type: 'log',
        version: 1,
      }

      store.logger.log(voidEvent)
      await store.flush()

      const fileContent = readFileSync(testFilePath, 'utf8')
      const event = JSON.parse(fileContent.trim()) as TelemetryEvent
      
      if (event.type === 'log') {
        expect(event.data).toBe(null)
      }

      store.end()
    })

    it('should respect maxSampleRate', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const sampledEvent: DefinedTelemetryLog<{count: number}> = {
        maxSampleRate: 1000, // 1 second
        name: 'sampled-event',
        schema: undefined as any,
        type: 'log',
        version: 1,
      }

      // Log multiple events quickly
      store.logger.log(sampledEvent, {count: 1})
      store.logger.log(sampledEvent, {count: 2})
      store.logger.log(sampledEvent, {count: 3})

      await store.flush()

      const fileContent = readFileSync(testFilePath, 'utf8')
      const lines = fileContent.trim().split('\n').filter(Boolean)
      
      // Should only have one event due to sampling
      expect(lines).toHaveLength(1)

      store.end()
    })
  })

  describe('logger.updateUserProperties', () => {
    it('should log user properties', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore<{platform: string; version: string;}>(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      store.logger.updateUserProperties({
        platform: 'darwin',
        version: '1.0.0',
      })
      
      await store.flush()

      const fileContent = readFileSync(testFilePath, 'utf8')
      const event = JSON.parse(fileContent.trim()) as TelemetryEvent
      
      expect(event.type).toBe('userProperties')
      expect(event.sessionId).toBe(sessionId)
      
      if (event.type === 'userProperties') {
        expect(event.properties).toEqual({
          platform: 'darwin',
          version: '1.0.0',
        })
      }

      store.end()
    })
  })

  describe('logger.trace', () => {
    const mockTraceDefinition: DefinedTelemetryTrace<{operation: string}> = {
      context: undefined as any,
      description: 'Test trace',
      name: 'test-trace',
      schema: undefined as any,
      type: 'trace',
      version: 1,
    }

    it('should create and manage traces', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const trace = store.logger.trace(mockTraceDefinition, {userId: 'user123'})
      
      trace.start()
      trace.log({operation: 'processing'})
      trace.complete()

      await store.flush()

      const fileContent = readFileSync(testFilePath, 'utf8')
      const lines = fileContent.trim().split('\n')
      const events = lines.map(line => JSON.parse(line) as TelemetryEvent)
      
      expect(events).toHaveLength(3)
      
      // Check start event
      expect(events[0].type).toBe('trace.start')
      if (events[0].type === 'trace.start') {
        expect(events[0].name).toBe('test-trace')
        expect(events[0].traceId).toBeDefined()
        expect(events[0].context).toEqual({userId: 'user123'})
      }
      
      // Check log event
      expect(events[1].type).toBe('trace.log')
      if (events[1].type === 'trace.log' && events[0].type === 'trace.start') {
        expect(events[1].traceId).toBe(events[0].traceId)
        expect(events[1].data).toEqual({operation: 'processing'})
      }
      
      // Check complete event
      expect(events[2].type).toBe('trace.complete')
      if (events[2].type === 'trace.complete' && events[0].type === 'trace.start') {
        expect(events[2].traceId).toBe(events[0].traceId)
      }

      store.end()
    })

    it('should handle trace errors', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const trace = store.logger.trace(mockTraceDefinition)
      const testError = new Error('Test error')
      
      trace.start()
      trace.error(testError)

      await store.flush()

      const fileContent = readFileSync(testFilePath, 'utf8')
      const lines = fileContent.trim().split('\n')
      const events = lines.map(line => JSON.parse(line) as TelemetryEvent)
      
      expect(events).toHaveLength(2)
      expect(events[1].type).toBe('trace.error')
      if (events[1].type === 'trace.error') {
        expect(events[1].data).toEqual({
          message: testError.message,
          name: testError.name,
          stack: testError.stack,
        })
      }

      store.end()
    })

    it('should support promise wrapping with await', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const trace = store.logger.trace(mockTraceDefinition)
      
      const promise = Promise.resolve('success')
      const result = await trace.await(promise, {operation: 'async-work'})
      
      expect(result).toBe('success')
      
      await store.flush()

      const fileContent = readFileSync(testFilePath, 'utf8')
      const lines = fileContent.trim().split('\n')
      const events = lines.map(line => JSON.parse(line) as TelemetryEvent)
      
      expect(events).toHaveLength(3) // start, log, complete
      expect(events[0].type).toBe('trace.start')
      expect(events[1].type).toBe('trace.log')
      if (events[1].type === 'trace.log') {
        expect(events[1].data).toEqual({operation: 'async-work'})
      }
      expect(events[2].type).toBe('trace.complete')

      store.end()
    })

    it('should support nested contexts', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const trace = store.logger.trace(mockTraceDefinition)
      const contextLogger = trace.newContext('nested-operation')
      
      const nestedEvent: DefinedTelemetryLog<{step: number}> = {
        name: 'nested-event',
        schema: undefined as any,
        type: 'log',
        version: 1,
      }
      
      contextLogger.log(nestedEvent, {step: 1})
      
      await store.flush()

      const fileContent = readFileSync(testFilePath, 'utf8')
      const event = JSON.parse(fileContent.trim()) as TelemetryEvent
      
      expect(event.type).toBe('log')
      // Note: log events don't have context in our implementation
      // since TelemetryLogEvent doesn't include context field

      store.end()
    })
  })

  describe('consent handling', () => {
    it('should not log events when consent is denied', async () => {
      const sessionId = 'test-session-123'
      mockResolveConsent.mockResolvedValue({status: 'denied'})
      
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const mockEvent: DefinedTelemetryLog<{prop: string}> = {
        name: 'test-event',
        schema: undefined as any,
        type: 'log',
        version: 1,
      }

      store.logger.log(mockEvent, {prop: 'value'})
      await store.flush()

      // File should not exist or be empty
      try {
        const fileContent = readFileSync(testFilePath, 'utf8')
        expect(fileContent.trim()).toBe('')
      } catch (error: any) {
        // File doesn't exist - that's also fine
        expect(error.code).toBe('ENOENT')
      }

      store.end()
    })

    it('should handle consent resolution errors gracefully', async () => {
      const sessionId = 'test-session-123'
      mockResolveConsent.mockRejectedValue(new Error('Consent error'))
      
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const mockEvent: DefinedTelemetryLog<{prop: string}> = {
        name: 'test-event',
        schema: undefined as any,
        type: 'log',
        version: 1,
      }

      // Should not throw
      expect(() => store.logger.log(mockEvent, {prop: 'value'})).not.toThrow()

      store.end()
    })
  })

  describe('buffering and flushing', () => {
    it('should auto-flush when buffer size is reached', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const mockEvent: DefinedTelemetryLog<{count: number}> = {
        name: 'test-event',
        schema: undefined as any,
        type: 'log',
        version: 1,
      }

      store.logger.log(mockEvent, {count: 1})
      store.logger.log(mockEvent, {count: 2}) // Should trigger auto-flush

      // Give it time to write
      await new Promise(resolve => setTimeout(resolve, 100))

      const fileContent = readFileSync(testFilePath, 'utf8')
      const lines = fileContent.trim().split('\n')
      
      expect(lines).toHaveLength(2)

      store.end()
    })

    it('should flush remaining events on end', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const mockEvent: DefinedTelemetryLog<{count: number}> = {
        name: 'test-event',
        schema: undefined as any,
        type: 'log',
        version: 1,
      }

      store.logger.log(mockEvent, {count: 1})
      store.end()

      // Give it time to flush and close
      await new Promise(resolve => setTimeout(resolve, 200))

      const fileContent = readFileSync(testFilePath, 'utf8')
      const lines = fileContent.trim().split('\n').filter(Boolean)
      
      expect(lines).toHaveLength(1)
    })

    it('should handle manual flush', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const mockEvent: DefinedTelemetryLog<{count: number}> = {
        name: 'test-event',
        schema: undefined as any,
        type: 'log',
        version: 1,
      }

      store.logger.log(mockEvent, {count: 1})
      await store.flush()

      const fileContent = readFileSync(testFilePath, 'utf8')
      const lines = fileContent.trim().split('\n').filter(Boolean)
      
      expect(lines).toHaveLength(1)

      store.end()
    })
  })

  describe('endWithBeacon', () => {
    it('should return false and end the store', async () => {
      const sessionId = 'test-session-123'
      const store = createTelemetryStore(sessionId, {
        resolveConsent: mockResolveConsent,
        sendEvents: mockSendEvents,
      })

      const result = store.endWithBeacon()
      
      expect(result).toBe(false)
    })
  })
})