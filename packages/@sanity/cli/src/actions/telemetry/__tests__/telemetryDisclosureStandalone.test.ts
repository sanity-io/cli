import {afterEach, describe, expect, test, vi} from 'vitest'

const mockGet = vi.hoisted(() => vi.fn())
const mockSet = vi.hoisted(() => vi.fn())
const mockIsCi = vi.hoisted(() => vi.fn())
const mockStderr = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getUserConfig: vi.fn().mockReturnValue({
      get: mockGet,
      set: mockSet,
    }),
    isCi: mockIsCi,
  }
})

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...actual,
    stderr: mockStderr,
  }
})

describe('telemetryDisclosureStandalone', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('shows disclosure on first run when config has no key', async () => {
    mockIsCi.mockReturnValue(false)
    mockGet.mockReturnValue(undefined)

    const {telemetryDisclosureStandalone} = await import('../telemetryDisclosureStandalone.js')

    telemetryDisclosureStandalone()

    expect(mockStderr).toHaveBeenCalledOnce()
    expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('telemetry'))
  })

  test('does not show disclosure in CI environment', async () => {
    mockIsCi.mockReturnValue(true)

    const {telemetryDisclosureStandalone} = await import('../telemetryDisclosureStandalone.js')

    telemetryDisclosureStandalone()

    expect(mockStderr).not.toHaveBeenCalled()
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('does not show disclosure if already shown', async () => {
    mockIsCi.mockReturnValue(false)
    mockGet.mockReturnValue(1234567890)

    const {telemetryDisclosureStandalone} = await import('../telemetryDisclosureStandalone.js')

    telemetryDisclosureStandalone()

    expect(mockStderr).not.toHaveBeenCalled()
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('sets the config key after showing disclosure', async () => {
    mockIsCi.mockReturnValue(false)
    mockGet.mockReturnValue(undefined)

    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000)

    const {telemetryDisclosureStandalone} = await import('../telemetryDisclosureStandalone.js')

    telemetryDisclosureStandalone()

    expect(mockSet).toHaveBeenCalledOnce()
    expect(mockSet).toHaveBeenCalledWith('telemetryDisclosed', 1700000000000)

    dateSpy.mockRestore()
  })
})
