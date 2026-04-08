import {afterEach, describe, expect, test} from 'vitest'

import {
  clearCliTelemetry,
  CLI_TELEMETRY_SYMBOL,
  getCliTelemetry,
  noopLogger,
  setCliTelemetry,
} from '../getCliTelemetry.js'
import {type CLITelemetryStore} from '../types.js'

describe('#getCliTelemetry', () => {
  afterEach(() => {
    clearCliTelemetry()
  })

  test('returns the global cliTelemetry store when initialized', () => {
    const mockTelemetry = {
      log: () => {},
    } as unknown as CLITelemetryStore

    setCliTelemetry(mockTelemetry)

    const result = getCliTelemetry()

    expect(result).toBe(mockTelemetry)
  })

  test('returns noop logger when not initialized', () => {
    const result = getCliTelemetry()

    expect(result).toBe(noopLogger)
  })

  test('uses Symbol.for to ensure global registry consistency', () => {
    const symbol1 = Symbol.for('sanity.cli.telemetry')
    const symbol2 = CLI_TELEMETRY_SYMBOL

    expect(symbol1).toBe(symbol2)
    expect(Symbol.keyFor(CLI_TELEMETRY_SYMBOL)).toBe('sanity.cli.telemetry')
  })
})
