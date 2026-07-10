import {type CLITelemetryStore} from '@sanity/cli-core/types'
import {type Mock, MockedObject, vi} from 'vitest'
/** @internal */
export const clearCliTelemetry: Mock = vi.fn()
/** @internal */
export const getCliTelemetry: Mock = vi.fn()
/** @internal */
export const reportCliTraceError: Mock = vi.fn()
/** @internal */
export const setCliTelemetry: Mock = vi.fn()
/** @internal */
export const getTelemetryBaseInfo: Mock = vi.fn()
/** @internal */
export const MockTrace: Record<'await' | 'complete' | 'error' | 'log' | 'start', Mock> & {
  newContext: () => MockedObject<CLITelemetryStore>
} = {
  await: vi.fn(),
  complete: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  newContext: () => MockTelemetry,
  start: vi.fn(),
}
/** @internal */
export const MockTelemetry: MockedObject<CLITelemetryStore> = {
  log: vi.fn(),
  resume: vi.fn(),
  trace: vi.fn(() => MockTrace),
  updateUserProperties: vi.fn(),
}
