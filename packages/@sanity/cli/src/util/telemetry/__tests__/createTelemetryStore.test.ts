import {type TelemetryEvent} from '@sanity/telemetry'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {createTelemetryStore} from '../createTelemetryStore.js'

const {appendFileSync, createLogger, mkdir, sanitizeTelemetryEvent} = vi.hoisted(() => ({
  appendFileSync: vi.fn(),
  createLogger: vi.fn((_sessionId: string, _emit: (event: TelemetryEvent) => void) => ({})),
  mkdir: vi.fn(async () => undefined),
  sanitizeTelemetryEvent: vi.fn(),
}))

vi.mock('node:fs', () => ({appendFileSync}))
vi.mock('node:fs/promises', () => ({mkdir}))
vi.mock('../generateTelemetryFilePath.js', () => ({
  generateTelemetryFilePath: vi.fn(async () => '/tmp/telemetry-test/events.ndjson'),
}))
vi.mock('../logger.js', () => ({createLogger}))
vi.mock('../sanitizeTelemetryEvent.js', () => ({sanitizeTelemetryEvent}))
vi.mock('../telemetryStoreDebug.js', () => ({telemetryStoreDebug: vi.fn()}))

const event: TelemetryEvent = {
  createdAt: '2026-10-14T00:00:00.000Z',
  data: {value: 'private'},
  name: 'Test',
  sessionId: 'test-session',
  type: 'log',
  version: 1,
}

describe('createTelemetryStore', () => {
  afterEach(() => vi.clearAllMocks())

  test('sanitizes before buffering and writes only the returned snapshot', async () => {
    let grantConsent: ((value: {status: 'granted'}) => void) | undefined
    const consent = new Promise<{status: 'granted'}>((resolve) => {
      grantConsent = resolve
    })
    const safeEvent = {...event, data: {value: '[REDACTED]'}}
    sanitizeTelemetryEvent.mockReturnValue(safeEvent)
    createTelemetryStore('test-session', {resolveConsent: () => consent})
    const emit = createLogger.mock.calls[0][1]
    emit(event)
    expect(sanitizeTelemetryEvent).toHaveBeenCalledWith(event)
    expect(appendFileSync).not.toHaveBeenCalled()
    grantConsent?.({status: 'granted'})
    await vi.waitFor(() =>
      expect(appendFileSync).toHaveBeenCalledWith(
        '/tmp/telemetry-test/events.ndjson',
        JSON.stringify(safeEvent) + '\n',
        'utf8',
      ),
    )
    emit(event)
    expect(appendFileSync).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(appendFileSync.mock.calls)).not.toContain('private')
  })

  test('drops events that cannot be safely serialized without breaking the command', async () => {
    sanitizeTelemetryEvent.mockImplementation(() => {
      throw new TypeError('circular')
    })
    createTelemetryStore('test-session', {resolveConsent: async () => ({status: 'granted'})})
    const emit = createLogger.mock.calls[0][1]
    expect(() => emit(event)).not.toThrow()
    await vi.waitFor(() => expect(mkdir).toHaveBeenCalled())
    expect(appendFileSync).not.toHaveBeenCalled()
  })
})
