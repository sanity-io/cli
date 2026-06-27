import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../test/mockSanityCommand.js'

// First: create the mocks and mocked SanityCommand class
const {MockedSanityCommand, mocks} = createMockSanityCommand()

// Second: install the mock on cli-core
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    SanityCommand: MockedSanityCommand,
  }
})

// Third: mock dataset import command imports
const mockTextFromStream = vi.hoisted(() => vi.fn())
const mockLogin = vi.hoisted(() => vi.fn())

vi.mock(import('node:stream/consumers'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    text: mockTextFromStream,
  }
})

vi.mock(import('../../actions/auth/login/login.js'), () => ({
  login: mockLogin,
}))

// Finally, import the module under test: login command
const {LoginCommand} = await import('../login.js')

describe('#login', () => {
  beforeEach(() => {
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockTextFromStream.mockResolvedValue('heyho')
    mockLogin.mockResolvedValue({})
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('calls login action and reports success', async () => {
    await LoginCommand.run()

    expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({token: undefined}))
    expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith('Login successful')
  })
  test('reads token from stdin if --with-token is passed', async () => {
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockTextFromStream.mockResolvedValue('secret-token')

    await LoginCommand.run(['--with-token'])

    expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({token: 'secret-token'}))
    expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith('Login successful')
  })
  test('errors if --with-token is passed in unattended mode', async () => {
    mocks.SanityCmdIsUnattended.mockReturnValue(true)
    mockTextFromStream.mockResolvedValue('secret-token')

    await LoginCommand.run(['--with-token'])

    expect(mockLogin).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(
      expect.stringMatching(/Login failed: token is required on standard input/i),
      {exit: 1},
    )
  })
})
