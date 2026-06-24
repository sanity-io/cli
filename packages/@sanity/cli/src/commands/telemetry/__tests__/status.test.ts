import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../../test/mockSanityCommand.js'

// First: create the mocks and mocked SanityCommand class
const {MockedSanityCommand, mocks: cmdMocks} = createMockSanityCommand()
// Second: install the mock on cli-core
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, SanityCommand: MockedSanityCommand}
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

// Finally, import the module under test: telemetry status command
const {Status} = await import('../status.js')

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
    expect(cmdMocks.SanityCmdOutputLog).toHaveBeenCalledWith(statusMsg)
    expect(cmdMocks.SanityCmdOutputLog).toHaveBeenCalledWith(expect.stringContaining(learnMoreMsg))
  })
  test('rejects invalid flags', async () => {
    await expect(Status.run(['--poop'])).rejects.toThrow('Nonexistent flag')
  })
})
