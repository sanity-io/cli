import {afterEach, describe, expect, test, vi} from 'vitest'

import {telemetryDisclosure} from '../telemetryDisclosure.js'

const mockIsCi = vi.hoisted(() => vi.fn())
const mockConfigGet = vi.hoisted(() => vi.fn())
const mockConfigSet = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getUserConfig: vi.fn().mockReturnValue({
      delete: vi.fn(),
      get: mockConfigGet,
      set: mockConfigSet,
    }),
    isCi: mockIsCi,
  }
})

describe('telemetryDisclosure', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints the disclosure to stderr and marks it disclosed', () => {
    mockIsCi.mockReturnValue(false)
    mockConfigGet.mockReturnValue(undefined)

    const logToStderr = vi.fn()
    telemetryDisclosure({logToStderr})

    expect(logToStderr).toHaveBeenCalledOnce()
    expect(logToStderr.mock.calls[0][0]).toContain('collects telemetry data')
    expect(mockConfigSet).toHaveBeenCalledWith('telemetryDisclosed', expect.any(Number))
  })

  test('does nothing in CI environments', () => {
    mockIsCi.mockReturnValue(true)

    const logToStderr = vi.fn()
    telemetryDisclosure({logToStderr})

    expect(logToStderr).not.toHaveBeenCalled()
    expect(mockConfigSet).not.toHaveBeenCalled()
  })

  test('does nothing when already disclosed', () => {
    mockIsCi.mockReturnValue(false)
    mockConfigGet.mockReturnValue(1_718_000_000_000)

    const logToStderr = vi.fn()
    telemetryDisclosure({logToStderr})

    expect(logToStderr).not.toHaveBeenCalled()
    expect(mockConfigSet).not.toHaveBeenCalled()
  })
})
