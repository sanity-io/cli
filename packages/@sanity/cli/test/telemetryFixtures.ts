import {type TelemetryEvent, type TelemetryLogEvent, type TelemetryTraceStartEvent} from '@sanity/telemetry'

import {type ConsentInformation} from '../src/actions/telemetry/types.js'

// Test Constants
export const TEST_AUTH_TOKEN = 'test-auth-token-123'

// Consent Factories
export const createMockConsent = (
  status: 'denied' | 'granted' | 'undetermined' | 'unset',
  reason?: 'fetchError' | 'localOverride' | 'unauthenticated',
): ConsentInformation => {
  if (status === 'undetermined') {
    return {
      reason: reason as 'fetchError' | 'unauthenticated' || 'fetchError',
      status: 'undetermined',
    }
  }
  if (status === 'denied') {
    return {
      reason: reason as 'localOverride' | undefined,
      status: 'denied',
    }
  }
  if (status === 'granted') {
    return { status: 'granted' }
  }
  return { status: 'unset' }
}

// Event Factories
export const createMockLogEvent = (
  overrides: Partial<TelemetryLogEvent> = {},
): TelemetryLogEvent => ({
  createdAt: '2024-01-01T00:00:00.000Z',
  data: {test: true},
  name: 'test-log-event',
  sessionId: 'test-session-123',
  type: 'log',
  version: 1,
  ...overrides,
})

export const createMockTraceEvent = (
  overrides: Partial<TelemetryTraceStartEvent<unknown>> = {},
): TelemetryTraceStartEvent<unknown> => ({
  context: {},
  createdAt: '2024-01-01T00:00:00.000Z',
  name: 'test-trace-event',
  sessionId: 'test-session-123',
  traceId: 'trace_01HQXB123ABC456DEF',
  type: 'trace.start',
  version: 1,
  ...overrides,
})


// Test Session Management
export const createTestSessionId = (suffix = ''): string =>
  `test-session-${Date.now()}${suffix ? `-${suffix}` : ''}`

// Parametric Test Data
export const CONSENT_TEST_CASES = [
  {
    consent: 'granted' as const,
    description: 'granted consent allows all operations',
    shouldEmit: true,
    shouldFlush: true,
  },
  {
    consent: 'denied' as const,
    description: 'denied consent blocks all operations',
    shouldEmit: false,
    shouldFlush: false,
  },
  {
    consent: 'undetermined' as const,
    description: 'undetermined consent blocks operations',
    shouldEmit: false,
    shouldFlush: false,
  },
  {
    consent: 'unset' as const,
    description: 'unset consent blocks operations',
    shouldEmit: false,
    shouldFlush: false,
  },
] as const


// NDJSON Test Utilities
export const createNDJSONContent = (events: TelemetryEvent[]): string => {
  return events.map((event) => JSON.stringify(event)).join('\n') + (events.length > 0 ? '\n' : '')
}

export const parseNDJSONContent = (content: string): TelemetryEvent[] => {
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}


// Async Test Utilities
export const waitForAsync = (ms = 0): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

