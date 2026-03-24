import {afterEach, describe, expect, test, vi} from 'vitest'

const mockCreateSessionId = vi.hoisted(() => vi.fn().mockReturnValue('test-session-id'))
const mockSetCliTelemetry = vi.hoisted(() => vi.fn())
const mockTelemetryDisclosureStandalone = vi.hoisted(() => vi.fn())
const mockFlushTelemetryFiles = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockResolveConsent = vi.hoisted(() => vi.fn())
const mockSendEvents = vi.hoisted(() => vi.fn())
const mockDetectRuntime = vi.hoisted(() => vi.fn().mockReturnValue('node'))

const mockTraceStart = vi.hoisted(() => vi.fn())
const mockTraceComplete = vi.hoisted(() => vi.fn())
const mockTraceError = vi.hoisted(() => vi.fn())
const mockTraceNewContext = vi.hoisted(() => vi.fn().mockReturnValue({} as never))
const mockUpdateUserProperties = vi.hoisted(() => vi.fn())
const mockTrace = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    complete: mockTraceComplete,
    error: mockTraceError,
    newContext: mockTraceNewContext,
    start: mockTraceStart,
  }),
)

const mockCreateTelemetryStore = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    log: vi.fn(),
    trace: mockTrace,
    updateUserProperties: mockUpdateUserProperties,
  }),
)

vi.mock('@sanity/telemetry', () => ({
  createSessionId: mockCreateSessionId,
  defineTrace: vi.fn().mockReturnValue({description: 'mock', name: 'mock', version: 1}),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    setCliTelemetry: mockSetCliTelemetry,
  }
})

vi.mock('../../../actions/telemetry/telemetryDisclosureStandalone.js', () => ({
  telemetryDisclosureStandalone: mockTelemetryDisclosureStandalone,
}))

vi.mock('../../../actions/telemetry/resolveConsent.js', () => ({
  resolveConsent: mockResolveConsent,
}))

vi.mock('../../../services/telemetry.js', () => ({
  sendEvents: mockSendEvents,
}))

vi.mock('../createTelemetryStore.js', () => ({
  createTelemetryStore: mockCreateTelemetryStore,
}))

vi.mock('../flushTelemetryFiles.js', () => ({
  flushTelemetryFiles: mockFlushTelemetryFiles,
}))

vi.mock('../../detectRuntime.js', () => ({
  detectRuntime: mockDetectRuntime,
}))

async function importSetup() {
  const mod = await import('../setupStandaloneTelemetry.js')
  return mod.setupStandaloneTelemetry
}

describe('setupStandaloneTelemetry', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns telemetry, complete, and error functions', async () => {
    const setupStandaloneTelemetry = await importSetup()

    const result = setupStandaloneTelemetry({
      commandName: 'init',
      version: '1.0.0',
    })

    expect(result).toHaveProperty('telemetry')
    expect(result).toHaveProperty('complete')
    expect(result).toHaveProperty('error')
    expect(typeof result.complete).toBe('function')
    expect(typeof result.error).toBe('function')
  })

  test('calls telemetryDisclosureStandalone during setup', async () => {
    const setupStandaloneTelemetry = await importSetup()

    setupStandaloneTelemetry({
      commandName: 'init',
      version: '1.0.0',
    })

    expect(mockTelemetryDisclosureStandalone).toHaveBeenCalledOnce()
  })

  test('calls createSessionId and passes it to createTelemetryStore', async () => {
    const setupStandaloneTelemetry = await importSetup()

    setupStandaloneTelemetry({
      commandName: 'init',
      version: '1.0.0',
    })

    expect(mockCreateSessionId).toHaveBeenCalledOnce()
    expect(mockCreateTelemetryStore).toHaveBeenCalledWith('test-session-id', {
      resolveConsent: mockResolveConsent,
    })
  })

  test('sets user properties on the telemetry store', async () => {
    const setupStandaloneTelemetry = await importSetup()

    setupStandaloneTelemetry({
      commandName: 'init',
      version: '2.5.0',
    })

    expect(mockUpdateUserProperties).toHaveBeenCalledWith({
      cliVersion: '2.5.0',
      cpuArchitecture: process.arch,
      machinePlatform: process.platform,
      runtime: 'node',
      runtimeVersion: process.version,
    })
  })

  test('starts a command trace with correct options', async () => {
    const setupStandaloneTelemetry = await importSetup()

    setupStandaloneTelemetry({
      args: ['my-project'],
      commandName: 'init',
      version: '1.0.0',
    })

    expect(mockTrace).toHaveBeenCalledWith(expect.anything(), {
      commandArguments: ['my-project'],
      coreOptions: {},
      extraArguments: [],
      groupOrCommand: 'init',
    })
    expect(mockTraceStart).toHaveBeenCalledOnce()
  })

  test('defaults args to an empty array when not provided', async () => {
    const setupStandaloneTelemetry = await importSetup()

    setupStandaloneTelemetry({
      commandName: 'init',
      version: '1.0.0',
    })

    expect(mockTrace).toHaveBeenCalledWith(expect.anything(), {
      commandArguments: [],
      coreOptions: {},
      extraArguments: [],
      groupOrCommand: 'init',
    })
  })

  test('calls setCliTelemetry with trace context', async () => {
    const setupStandaloneTelemetry = await importSetup()

    setupStandaloneTelemetry({
      commandName: 'init',
      version: '1.0.0',
    })

    expect(mockTraceNewContext).toHaveBeenCalledWith('init')
    expect(mockSetCliTelemetry).toHaveBeenCalledOnce()
    expect(mockSetCliTelemetry).toHaveBeenCalledWith(expect.anything(), {
      reportTraceError: expect.any(Function),
    })
  })

  test('complete() completes the trace and flushes telemetry', async () => {
    const setupStandaloneTelemetry = await importSetup()

    const {complete} = setupStandaloneTelemetry({
      commandName: 'init',
      version: '1.0.0',
    })

    await complete()

    expect(mockTraceComplete).toHaveBeenCalledOnce()
    expect(mockFlushTelemetryFiles).toHaveBeenCalledWith({
      resolveConsent: mockResolveConsent,
      sendEvents: mockSendEvents,
    })
  })

  test('error() records the error on the trace and flushes telemetry', async () => {
    const setupStandaloneTelemetry = await importSetup()

    const {error} = setupStandaloneTelemetry({
      commandName: 'init',
      version: '1.0.0',
    })

    const testError = new Error('something went wrong')
    await error(testError)

    expect(mockTraceError).toHaveBeenCalledWith(testError)
    expect(mockFlushTelemetryFiles).toHaveBeenCalledWith({
      resolveConsent: mockResolveConsent,
      sendEvents: mockSendEvents,
    })
  })

  test('complete() resolves even when flush times out', async () => {
    mockFlushTelemetryFiles.mockImplementation(
      () => new Promise(() => {}), // never resolves
    )

    const setupStandaloneTelemetry = await importSetup()

    const {complete} = setupStandaloneTelemetry({
      commandName: 'init',
      flushTimeoutMs: 50,
      version: '1.0.0',
    })

    // Should resolve without throwing despite the flush never completing
    await expect(complete()).resolves.toBeUndefined()
  })

  test('error() resolves even when flush times out', async () => {
    mockFlushTelemetryFiles.mockImplementation(
      () => new Promise(() => {}), // never resolves
    )

    const setupStandaloneTelemetry = await importSetup()

    const {error} = setupStandaloneTelemetry({
      commandName: 'init',
      flushTimeoutMs: 50,
      version: '1.0.0',
    })

    await expect(error(new Error('fail'))).resolves.toBeUndefined()
  })

  test('complete() resolves even when flush rejects', async () => {
    mockFlushTelemetryFiles.mockRejectedValue(new Error('flush failed'))

    const setupStandaloneTelemetry = await importSetup()

    const {complete} = setupStandaloneTelemetry({
      commandName: 'init',
      version: '1.0.0',
    })

    await expect(complete()).resolves.toBeUndefined()
  })
})
