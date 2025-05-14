import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {logout} from '../../actions/auth/logout.js'
import {getCliToken} from '../../config/cliToken.js'
import {LogoutCommand} from '../logout.js'

vi.mock('../../actions/auth/logout.js')
vi.mock('../../config/cliToken.js')

afterEach(() => {
  vi.clearAllMocks()
})

describe('#logout', () => {
  test('--help works', async () => {
    const {stdout} = await runCommand(['logout', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Logs out the CLI from the current user session

      USAGE
        $ sanity logout

      DESCRIPTION
        Logs out the CLI from the current user session

      "
    `)
  })

  test('logs out successfully if a token exists', async () => {
    vi.mocked(getCliToken).mockResolvedValueOnce('test-token')

    const {stdout} = await testCommand(LogoutCommand)

    expect(logout).toHaveBeenCalledTimes(1)
    expect(stdout).toContain('Logged out successfully')
  })

  test('shows an error if no token exists', async () => {
    vi.mocked(getCliToken).mockResolvedValueOnce('')

    const {stdout} = await testCommand(LogoutCommand)

    expect(logout).not.toHaveBeenCalled()
    expect(stdout).toContain('No login credentials found')
  })
})
