import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../../test/mockSanityCommand.js'

// First: create the mocks and mocked SanityCommand class
const {MockedSanityCommand, mocks: cmdMocks} = createMockSanityCommand()
// Second: install the mock on cli-core
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, SanityCommand: MockedSanityCommand}
})

// Third: mock telemetry enable command imports
const mockSetConsent = vi.hoisted(() => vi.fn())
const mockLearnMore = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/telemetry/setConsent.js', () => ({setConsent: mockSetConsent}))
vi.mock('../../../actions/telemetry/telemetryLearnMoreMessage.js', () => ({
  telemetryLearnMoreMessage: mockLearnMore,
}))

// Finally, import the module under test: telemetry disable command
const {Disable} = await import('../disable.js')

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
    expect(cmdMocks.SanityCmdOutputLog).toHaveBeenCalledWith('heya')
  })
  test('should call learnMore action if setConsent status returns changed and output learn more action response', async () => {
    mockSetConsent.mockResolvedValue({changed: true, message: 'heya'})
    mockLearnMore.mockReturnValue('learn more')
    await Disable.run([])
    expect(mockLearnMore).toHaveBeenCalledWith('denied')
    expect(cmdMocks.SanityCmdOutputLog).toHaveBeenCalledWith(expect.stringContaining('learn more'))
  })
  test('rejects invalid flags', async () => {
    await expect(Disable.run(['--poop'])).rejects.toThrow('Nonexistent flag')
  })
  test('outputs error thrown by setConsent', async () => {
    mockSetConsent.mockRejectedValue(new Error('boom'))
    await Disable.run([])
    expect(cmdMocks.SanityCmdOutputError).toHaveBeenCalledWith(
      'boom',
      expect.objectContaining({exit: 1}),
    )
  })
})
