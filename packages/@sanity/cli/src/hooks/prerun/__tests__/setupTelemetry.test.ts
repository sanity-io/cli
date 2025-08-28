import {isCi} from '@sanity/cli-core'
import {testHook} from '@sanity/cli-test'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {setupTelemetry} from '../setupTelemetry.js'

// Hoisted mock functions to avoid initialization order issues
const {mockGet, mockGetUserConfig, mockSet} = vi.hoisted(() => {
  const mockGet = vi.fn()
  const mockSet = vi.fn()
  const mockGetUserConfig = vi.fn(() => ({
    get: mockGet,
    set: mockSet,
  }))
  return {mockGet, mockGetUserConfig, mockSet}
})

vi.mock('../../../../../cli-core/src/util/getUserConfig.js', () => ({
  getUserConfig: mockGetUserConfig,
}))

vi.mock('../../../../../cli-core/src/util/isCi.js', () => ({
  isCi: vi.fn(() => false),
}))

const mockIsCi = vi.mocked(isCi)

describe('#setupTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue(false) // Default: not disclosed
  })

  test('shows telemetry disclosure when not previously disclosed', async () => {
    const {stderr} = await testHook<'prerun'>(setupTelemetry)

    expect(mockGet).toHaveBeenCalledWith('telemetryDisclosed')
    expect(mockSet).toHaveBeenCalledWith('telemetryDisclosed', expect.any(Number))
    expect(stderr).toMatchInlineSnapshot(`
      "
      ╭─────────────────────────────────────────────────────────────────────────────╮
      │                                                                             │
      │   The Sanity CLI now collects telemetry data on general usage and errors.   │
      │   This helps us improve Sanity and prioritize features.                     │
      │                                                                             │
      │   To opt in/out, run npx sanity telemetry enable/disable.                   │
      │                                                                             │
      │   Learn more here:                                                          │
      │   https://www.sanity.io/telemetry                                           │
      │                                                                             │
      ╰─────────────────────────────────────────────────────────────────────────────╯

      "
    `)
  })

  test('does not show disclosure when already disclosed', async () => {
    mockGet.mockReturnValue(1_234_567_890) // Already disclosed timestamp

    const {stderr} = await testHook<'prerun'>(setupTelemetry)

    expect(mockGet).toHaveBeenCalledWith('telemetryDisclosed')
    expect(mockSet).not.toHaveBeenCalled()
    expect(stderr).toBe('')
  })

  test('does not show disclosure in CI environment', async () => {
    mockIsCi.mockReturnValueOnce(true)

    const {stderr} = await testHook<'prerun'>(setupTelemetry)

    expect(mockGet).not.toHaveBeenCalled()
    expect(mockSet).not.toHaveBeenCalled()
    expect(stderr).toBe('')
  })

  test('sets disclosure timestamp when showing disclosure', async () => {
    const beforeTime = Date.now()

    await testHook<'prerun'>(setupTelemetry)

    const afterTime = Date.now()
    expect(mockSet).toHaveBeenCalledWith('telemetryDisclosed', expect.any(Number))

    const timestamp = mockSet.mock.calls[0][1]
    expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
    expect(timestamp).toBeLessThanOrEqual(afterTime)
  })
})
