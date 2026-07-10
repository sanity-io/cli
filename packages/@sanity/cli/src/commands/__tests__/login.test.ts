import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {LoginCommand} from '../login.js'

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)

const mockTextFromStream = vi.hoisted(() => vi.fn())
const mockLogin = vi.hoisted(() => vi.fn())

vi.mock('node:stream/consumers', () => ({
  text: mockTextFromStream,
}))

vi.mock(import('../../actions/auth/login/login.js'), () => ({
  login: mockLogin,
}))

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
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Login successful')
  })
  test('reads token from stdin if --with-token is passed', async () => {
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockTextFromStream.mockResolvedValue('secret-token')

    await LoginCommand.run(['--with-token'])

    expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({token: 'secret-token'}))
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Login successful')
  })
  test('errors if --with-token is passed in unattended mode', async () => {
    mocks.SanityCmdIsUnattended.mockReturnValue(true)
    mockTextFromStream.mockResolvedValue('secret-token')

    await LoginCommand.run(['--with-token'])

    expect(mockLogin).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringMatching(/Login failed: token is required on standard input/i),
      {exit: 1},
    )
  })
})
