import {mocks} from '@sanity/cli-test/mocks'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {Status} from '../status.js'

vi.mock('@sanity/cli-core/SanityCommand', async () => {
  const actual = await import('@sanity/cli-test/mocks')
  return {SanityCommand: actual.MockedSanityCommand}
})

// Third: mock telemetry status command imports
const mockResolveConsent = vi.hoisted(() => vi.fn())
const mockLearnMore = vi.hoisted(() => vi.fn())
const mockStatusMsg = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/telemetry/resolveConsent.js', () => ({
  resolveConsent: mockResolveConsent,
}))
vi.mock('../../../actions/telemetry/getLearnMoreMessage.js', () => ({
  getLearnMoreMessage: mockLearnMore,
}))
vi.mock('../../../actions/telemetry/getStatusMessage.js', () => ({getStatusMessage: mockStatusMsg}))

describe('telemetry enable command', () => {
  beforeEach(() => {
    mockResolveConsent.mockResolvedValue(undefined)
    mockLearnMore.mockReturnValue(undefined)
    mockStatusMsg.mockReturnValue('status')
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should call resolveConsent, pass consent to getStatusMessage and getLearnMoreMessage and output both results', async () => {
    const consentInfo = {status: 'granted'}
    const statusMsg = 'delayed'
    const learnMoreMsg = 'always be closing'
    mockResolveConsent.mockResolvedValue(consentInfo)
    mockStatusMsg.mockReturnValue(statusMsg)
    mockLearnMore.mockReturnValue(learnMoreMsg)
    await Status.run([])
    expect(mockStatusMsg).toHaveBeenCalledWith(consentInfo)
    expect(mockLearnMore).toHaveBeenCalledWith(consentInfo.status)
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(statusMsg)
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining(learnMoreMsg))
  })
  test('rejects invalid flags', async () => {
    await expect(Status.run(['--poop'])).rejects.toThrow('Nonexistent flag')
  })
})
