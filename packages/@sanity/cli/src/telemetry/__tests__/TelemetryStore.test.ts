import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {TelemetryStore} from '../Old_TelemetryStore.js'

// Mock the telemetry debug function
vi.mock('../../actions/telemetry/telemetryDebug.js', () => ({
  telemetryDebug: vi.fn(),
}))

// Mock the resolve consent function
vi.mock('../../actions/telemetry/resolveConsent.js', () => ({
  resolveConsent: vi.fn(),
}))

// Mock @sanity/telemetry
vi.mock('@sanity/telemetry', () => ({
  createBatchedStore: vi.fn(),
  createSessionId: vi.fn(() => 'test-session-id'),
  defineEvent: vi.fn(),
  defineTrace: vi.fn(),
}))

describe('TelemetryStore', () => {
  let telemetryStore: TelemetryStore
  const mockTelemetryLogger = {
    log: vi.fn(),
    trace: vi.fn(),
    updateUserProperties: vi.fn(),
  }
  const mockTelemetryStore = {
    end: vi.fn(),
    endWithBeacon: vi.fn(),
    flush: vi.fn(),
    logger: mockTelemetryLogger,
  }

  beforeEach(async () => {
    // Reset the singleton instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(TelemetryStore as any).instance = null

    const {resolveConsent} = await import('../../actions/telemetry/resolveConsent.js')
    const {createBatchedStore} = await import('@sanity/telemetry')

    vi.mocked(resolveConsent).mockResolvedValue({status: 'granted'})
    vi.mocked(createBatchedStore).mockReturnValue(mockTelemetryStore)

    telemetryStore = TelemetryStore.getInstance()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getInstance', () => {
    it('should return the same instance (singleton)', () => {
      const instance1 = TelemetryStore.getInstance()
      const instance2 = TelemetryStore.getInstance()

      expect(instance1).toBe(instance2)
    })

    it('should create a new instance if none exists', () => {
      const instance = TelemetryStore.getInstance()

      expect(instance).toBeInstanceOf(TelemetryStore)
    })
  })

  describe('initialize', () => {
    it('should initialize successfully with granted consent', async () => {
      const {resolveConsent} = await import('../../actions/telemetry/resolveConsent.js')
      const {createBatchedStore} = await import('@sanity/telemetry')

      vi.mocked(resolveConsent).mockResolvedValue({status: 'granted'})

      await telemetryStore.initialize({
        env: {},
        projectId: 'test-project',
      })

      expect(resolveConsent).toHaveBeenCalledWith({env: {}})
      expect(createBatchedStore).toHaveBeenCalled()
      expect(telemetryStore.isConsentGranted()).toBe(true)
    })

    it('should initialize with denied consent', async () => {
      const {resolveConsent} = await import('../../actions/telemetry/resolveConsent.js')
      const {createBatchedStore} = await import('@sanity/telemetry')

      vi.mocked(resolveConsent).mockResolvedValue({reason: 'localOverride', status: 'denied'})

      await telemetryStore.initialize({
        env: {},
        projectId: 'test-project',
      })

      expect(resolveConsent).toHaveBeenCalledWith({env: {}})
      expect(createBatchedStore).not.toHaveBeenCalled()
      expect(telemetryStore.isConsentGranted()).toBe(false)
    })

    it('should handle initialization errors gracefully', async () => {
      const {resolveConsent} = await import('../../actions/telemetry/resolveConsent.js')

      vi.mocked(resolveConsent).mockRejectedValue(new Error('Network error'))

      await expect(
        telemetryStore.initialize({
          env: {},
          projectId: 'test-project',
        }),
      ).resolves.not.toThrow()
    })

    it('should not initialize twice', async () => {
      const {resolveConsent} = await import('../../actions/telemetry/resolveConsent.js')

      await telemetryStore.initialize({
        env: {},
        projectId: 'test-project',
      })

      await telemetryStore.initialize({
        env: {},
        projectId: 'another-project',
      })

      expect(resolveConsent).toHaveBeenCalledTimes(1)
    })
  })

  describe('log', () => {
    const mockEventDefinition = {
      description: 'Test event',
      name: 'test-event',
      schema: {} as unknown,
      type: 'log' as const,
      version: 1,
    }

    beforeEach(async () => {
      await telemetryStore.initialize({
        env: {},
        projectId: 'test-project',
      })
    })

    it('should log events when consent is granted', () => {
      telemetryStore.log(mockEventDefinition, {prop: 'value'})

      expect(mockTelemetryLogger.log).toHaveBeenCalledWith(mockEventDefinition, {prop: 'value'})
    })

    it('should not log events when consent is denied', async () => {
      const {resolveConsent} = await import('../../actions/telemetry/resolveConsent.js')

      vi.mocked(resolveConsent).mockResolvedValue({reason: 'localOverride', status: 'denied'})

      // Reset instance and reinitialize with denied consent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(TelemetryStore as any).instance = null
      const store = TelemetryStore.getInstance()
      await store.initialize({env: {}, projectId: 'test'})

      store.log(mockEventDefinition)

      expect(mockTelemetryLogger.log).not.toHaveBeenCalled()
    })

    it('should handle logging errors gracefully', () => {
      mockTelemetryLogger.log.mockImplementation(() => {
        throw new Error('Logging error')
      })

      expect(() => telemetryStore.log(mockEventDefinition)).not.toThrow()
    })
  })

  describe('trace', () => {
    const mockTraceDefinition = {
      context: undefined as void,
      description: 'Test trace',
      name: 'test-trace',
      schema: {} as unknown,
      type: 'trace' as const,
      version: 1,
    }

    beforeEach(async () => {
      await telemetryStore.initialize({
        env: {},
        projectId: 'test-project',
      })
    })

    it('should return a trace when consent is granted', () => {
      const mockTrace = {
        await: vi.fn(),
        complete: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        newContext: vi.fn(),
        start: vi.fn(),
      }
      mockTelemetryLogger.trace.mockReturnValue(mockTrace)

      const trace = telemetryStore.trace(mockTraceDefinition, {prop: 'value'})

      expect(mockTelemetryLogger.trace).toHaveBeenCalledWith(mockTraceDefinition, {prop: 'value'})
      expect(trace).toBe(mockTrace)
    })

    it('should return noop trace when consent is denied', async () => {
      const {resolveConsent} = await import('../../actions/telemetry/resolveConsent.js')

      vi.mocked(resolveConsent).mockResolvedValue({reason: 'localOverride', status: 'denied'})

      // Reset instance and reinitialize with denied consent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(TelemetryStore as any).instance = null
      const store = TelemetryStore.getInstance()
      await store.initialize({env: {}, projectId: 'test'})

      const trace = store.trace(mockTraceDefinition)

      expect(mockTelemetryLogger.trace).not.toHaveBeenCalled()
      expect(trace).toHaveProperty('start')
      expect(trace).toHaveProperty('log')
      expect(trace).toHaveProperty('error')
      expect(trace).toHaveProperty('complete')
    })
  })

  describe('updateUserProperties', () => {
    beforeEach(async () => {
      await telemetryStore.initialize({
        env: {},
        projectId: 'test-project',
      })
    })

    it('should update user properties when consent is granted', () => {
      const properties = {
        cliVersion: '1.0.0',
        runtime: 'node',
      }

      telemetryStore.updateUserProperties(properties)

      expect(mockTelemetryLogger.updateUserProperties).toHaveBeenCalledWith(properties)
    })

    it('should not update user properties when consent is denied', async () => {
      const {resolveConsent} = await import('../../actions/telemetry/resolveConsent.js')

      vi.mocked(resolveConsent).mockResolvedValue({reason: 'localOverride', status: 'denied'})

      // Reset instance and reinitialize with denied consent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(TelemetryStore as any).instance = null
      const store = TelemetryStore.getInstance()
      await store.initialize({env: {}, projectId: 'test'})

      store.updateUserProperties({cliVersion: '1.0.0'})

      expect(mockTelemetryLogger.updateUserProperties).not.toHaveBeenCalled()
    })
  })

  describe('flush', () => {
    beforeEach(async () => {
      await telemetryStore.initialize({
        env: {},
        projectId: 'test-project',
      })
    })

    it('should flush telemetry events when consent is granted', async () => {
      await telemetryStore.flush()

      expect(mockTelemetryStore.flush).toHaveBeenCalled()
    })

    it('should not flush when consent is denied', async () => {
      const {resolveConsent} = await import('../../actions/telemetry/resolveConsent.js')

      vi.mocked(resolveConsent).mockResolvedValue({reason: 'localOverride', status: 'denied'})

      // Reset instance and reinitialize with denied consent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(TelemetryStore as any).instance = null
      const store = TelemetryStore.getInstance()
      await store.initialize({env: {}, projectId: 'test'})

      await store.flush()

      expect(mockTelemetryStore.flush).not.toHaveBeenCalled()
    })

    it('should handle flush errors gracefully', async () => {
      mockTelemetryStore.flush.mockRejectedValue(new Error('Flush error'))

      await expect(telemetryStore.flush()).resolves.not.toThrow()
    })
  })

  describe('getConsentStatus', () => {
    it('should return null before initialization', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(TelemetryStore as any).instance = null
      const store = TelemetryStore.getInstance()

      expect(store.getConsentStatus()).toBeNull()
    })

    it('should return consent status after initialization', async () => {
      await telemetryStore.initialize({
        env: {},
        projectId: 'test-project',
      })

      expect(telemetryStore.getConsentStatus()).toBe('granted')
    })
  })
})
