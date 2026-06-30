import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../../test/mockSanityCommand.js'

// Third: mock telemetry enable command imports
const mockSetConsent = vi.hoisted(() => vi.fn())
const mockLearnMore = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/telemetry/setConsent.js', () => ({setConsent: mockSetConsent}))
vi.mock('../../../actions/telemetry/telemetryLearnMoreMessage.js', () => ({
  telemetryLearnMoreMessage: mockLearnMore,
}))

// Finally, import the module under test: telemetry disable command
const {Disable} = await import('../disable.js')
const {createCmdInstance, mocks} = await createMockSanityCommand(Disable)

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
    await createCmdInstance([]).run()
    expect(mockSetConsent).toHaveBeenCalledWith({status: 'denied'})
    expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith('heya')
  })
  test('should call learnMore action if setConsent status returns changed and output learn more action response', async () => {
    mockSetConsent.mockResolvedValue({changed: true, message: 'heya'})
    mockLearnMore.mockReturnValue('learn more')
    await createCmdInstance([]).run()
    expect(mockLearnMore).toHaveBeenCalledWith('denied')
    expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(expect.stringContaining('learn more'))
  })
  test('rejects invalid flags', async () => {
    await expect(createCmdInstance(['--poop']).run()).rejects.toThrow('Nonexistent flag')
  })
  test('outputs error thrown by setConsent', async () => {
    mockSetConsent.mockRejectedValue(new Error('boom'))
    await createCmdInstance([]).run()
    expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(
      'boom',
      expect.objectContaining({exit: 1}),
    )
  })
})
