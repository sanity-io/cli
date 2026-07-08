import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {Disable} from '../disable.js'

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)

// Third: mock telemetry enable command imports
const mockSetConsent = vi.hoisted(() => vi.fn())
const mockLearnMore = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/telemetry/setConsent.js', () => ({setConsent: mockSetConsent}))
vi.mock('../../../actions/telemetry/telemetryLearnMoreMessage.js', () => ({
  telemetryLearnMoreMessage: mockLearnMore,
}))

describe('telemetry disable command', () => {
  beforeEach(() => {
    mockSetConsent.mockResolvedValue(undefined)
    mockLearnMore.mockReturnValue(undefined)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should call setConsent action with status=denied and log returned message', async () => {
    mockSetConsent.mockResolvedValue({message: 'heya'})
    await Disable.run([])
    expect(mockSetConsent).toHaveBeenCalledWith({status: 'denied'})
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('heya')
  })
  test('should call learnMore action if setConsent status returns changed and output learn more action response', async () => {
    mockSetConsent.mockResolvedValue({changed: true, message: 'heya'})
    mockLearnMore.mockReturnValue('learn more')
    await Disable.run([])
    expect(mockLearnMore).toHaveBeenCalledWith('denied')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('learn more'))
  })
  test('rejects invalid flags', async () => {
    await expect(Disable.run(['--poop'])).rejects.toThrow('Nonexistent flag')
  })
  test('outputs error thrown by setConsent', async () => {
    mockSetConsent.mockRejectedValue(new Error('boom'))
    await Disable.run([])
    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      'boom',
      expect.objectContaining({exit: 1}),
    )
  })
})
