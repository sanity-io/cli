import {mocks} from '@sanity/cli-test/mocks'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {Enable} from '../enable.js'

vi.mock('@sanity/cli-core/SanityCommand', async () => {
  const actual = await import('@sanity/cli-test/mocks')
  return {SanityCommand: actual.MockedSanityCommand}
})

const mockSetConsent = vi.hoisted(() => vi.fn())
const mockLearnMore = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/telemetry/setConsent.js', () => ({setConsent: mockSetConsent}))
vi.mock('../../../actions/telemetry/telemetryLearnMoreMessage.js', () => ({
  telemetryLearnMoreMessage: mockLearnMore,
}))

describe('telemetry enable command', () => {
  beforeEach(() => {
    mockSetConsent.mockResolvedValue(undefined)
    mockLearnMore.mockReturnValue(undefined)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should call setConsent action with status=granted and log returned message', async () => {
    mockSetConsent.mockResolvedValue({message: 'heya'})
    await Enable.run([])
    expect(mockSetConsent).toHaveBeenCalledWith({status: 'granted'})
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('heya')
  })
  test('should call learnMore action if setConsent status returns changed and output learn more action response', async () => {
    mockSetConsent.mockResolvedValue({changed: true, message: 'heya'})
    mockLearnMore.mockReturnValue('learn more')
    await Enable.run([])
    expect(mockLearnMore).toHaveBeenCalledWith('granted')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('learn more'))
  })
  test('rejects invalid flags', async () => {
    await expect(Enable.run(['--poop'])).rejects.toThrow('Nonexistent flag')
  })
  test('outputs error thrown by setConsent', async () => {
    mockSetConsent.mockRejectedValue(new Error('boom'))
    await Enable.run([])
    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      'boom',
      expect.objectContaining({exit: 1}),
    )
  })
})
