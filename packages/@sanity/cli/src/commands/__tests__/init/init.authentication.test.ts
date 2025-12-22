import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../../init'

const mocks = vi.hoisted(() => ({
  getCliUser: vi.fn().mockResolvedValue({
    email: 'test@example.com',
    id: 'user-123',
    name: 'Test User',
    provider: 'saml-123',
  }),
  login: vi.fn(),
}))

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: vi.fn().mockResolvedValue({
    name: 'Next.js',
    slug: 'nextjs',
  }),
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/util/isInteractive.js', () => ({
  isInteractive: vi.fn().mockReturnValue(true),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../services/user.js', () => ({
  getCliUser: mocks.getCliUser,
}))

vi.mock('../../../actions/auth/login/login.js', () => ({
  login: mocks.login,
}))

describe('#init: authentication', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('user is authenticated with valid token', async () => {
    const {error, stdout} = await testCommand(InitCommand, [])

    expect(error).toBeUndefined()
    expect(stdout).toContain('You are logged in as test@example.com using SAML')
  })

  test('throws error user is authenticated with invalid token in unattended mode', async () => {
    mocks.getCliUser.mockRejectedValueOnce('Invalid token')

    const {error} = await testCommand(InitCommand, ['--yes', '--dataset=test', '--project==test'])

    expect(error?.message).toContain(
      'Must be logged in to run this command in unattended mode, run `sanity login`',
    )
  })

  test('calls login when token invalid and not in unattended mode', async () => {
    mocks.getCliUser.mockRejectedValueOnce('Invalid token')

    const {error} = await testCommand(InitCommand, [])

    expect(error).toBe(undefined)
    expect(mocks.login).toHaveBeenCalled()
  })
})
