import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../../init'

const mocks = vi.hoisted(() => ({
  getCliToken: vi.fn(),
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
  getCliToken: mocks.getCliToken,
}))

vi.mock('../../../services/user.js', () => ({
  getCliUser: mocks.getCliUser,
}))

vi.mock('../../../actions/auth/login/login.js', () => ({
  login: mocks.login,
}))

// Mocks to help resolve rest of init
vi.mock('../../../services/datasets.js', () => ({
  listDatasets: vi.fn().mockResolvedValue([{aclMode: 'public', name: 'test'}]),
}))

vi.mock('../../../services/getProjectFeatures.js', () => ({
  getProjectFeatures: vi.fn().mockResolvedValue(['privateDatasets']),
}))

vi.mock('../../../services/organizations.js', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{id: 'org-1', name: 'Org 1', slug: 'org-1'}]),
}))

vi.mock('../../../services/projects.js', () => ({
  listProjects: vi
    .fn()
    .mockResolvedValue([{createdAt: '2024-01-01T00:00:00Z', displayName: 'Test', id: 'test'}]),
}))

describe('#init: authentication', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('user is authenticated with valid token', async () => {
    mocks.getCliToken.mockResolvedValue('test-token')

    const {stdout} = await testCommand(InitCommand, ['--dataset=test', '--project=test'])
    expect(stdout).toContain('You are logged in as test@example.com using SAML')
  })

  test('throws error if user is authenticated with invalid token in unattended mode', async () => {
    mocks.getCliUser.mockRejectedValueOnce('Invalid token')

    const {error} = await testCommand(InitCommand, ['--yes', '--dataset=test', '--project=test'])

    expect(error?.message).toContain(
      'Must be logged in to run this command in unattended mode, run `sanity login`',
    )
  })

  test('calls login when token invalid and not in unattended mode', async () => {
    mocks.getCliUser.mockRejectedValueOnce('Invalid token')

    await testCommand(InitCommand, ['--dataset=test', '--project=test'])

    expect(mocks.login).toHaveBeenCalled()
  })
})
