import {type CLITelemetryStore} from '@sanity/cli-core'
import {vi} from 'vitest'

/**
 * @public
 */
export interface MockTelemetryOptions {
  trace?: () => void
  updateUserProperties?: () => void
}

/**
 * @public
 * @param options - Options for mocking the telemetry store.
 * @returns The mocked telemetry store.
 */
export const mockTelemetry = (options: MockTelemetryOptions = {}): CLITelemetryStore => {
  const telemetry = {
    trace: vi.fn().mockReturnValue({
      complete: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      newContext: vi.fn(),
      start: vi.fn(),
    }),
    updateUserProperties: vi.fn(),
    ...options,
  } as unknown as CLITelemetryStore

  // We are not using the export from @sanity/cli-core because
  // This can be used where `@sanity/cli-core` is mocked and vitest will run into issues.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any)[Symbol.for('sanity.cli.telemetry')] = {logger: telemetry}

  return telemetry
}
