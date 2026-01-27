import {CLIError} from '@oclif/core/errors'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {type CLITelemetryStore} from '../../telemetry/types.js'
import {
  clearCliTelemetry,
  CLI_TELEMETRY_SYMBOL,
  getCliTelemetry,
  setCliTelemetry,
} from '../getCliTelemetry.js'

describe('#getCliTelemetry', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
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

  test('throws CLIError when not initialized and TEST env is falsy', () => {
    vi.stubEnv('TEST', '')

    expect(() => getCliTelemetry()).toThrow(CLIError)
    expect(() => getCliTelemetry()).toThrow('CLI telemetry not initialized')
  })

  test('returns undefined without throwing when TEST env is truthy', () => {
    vi.stubEnv('TEST', 'true')

    const result = getCliTelemetry()

    expect(result).toBeUndefined()
  })

  test('returns undefined when TEST env is set to any truthy value', () => {
    vi.stubEnv('TEST', '1')

    const result = getCliTelemetry()

    expect(result).toBeUndefined()
  })

  test('returns cliTelemetry even when TEST env is set', () => {
    const mockTelemetry = {
      log: () => {},
    } as unknown as CLITelemetryStore

    setCliTelemetry(mockTelemetry)
    vi.stubEnv('TEST', 'true')

    const result = getCliTelemetry()

    expect(result).toBe(mockTelemetry)
  })

  test('uses Symbol.for to ensure global registry consistency', () => {
    const symbol1 = Symbol.for('sanity.cli.telemetry')
    const symbol2 = CLI_TELEMETRY_SYMBOL

    expect(symbol1).toBe(symbol2)
    expect(Symbol.keyFor(CLI_TELEMETRY_SYMBOL)).toBe('sanity.cli.telemetry')
  })
})
