import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../../init'

const mockGetById = vi.hoisted(() => vi.fn())
const mockLogin = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      users: {
        getById: mockGetById,
      } as never,
    }),
  }
})

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: vi.fn().mockResolvedValue({
    name: 'Next.js',
    slug: 'nextjs',
  }),
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('../../../actions/auth/login/login.js', () => ({
  login: mockLogin,
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
    mockGetById.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'saml-123',
    })

    const {error, stdout} = await testCommand(InitCommand, [], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain('You are logged in as test@example.com using SAML')
  })

  test('throws error if user is authenticated with invalid token in unattended mode', async () => {
    mockGetById.mockRejectedValueOnce(new Error('Invalid token'))

    const {error} = await testCommand(InitCommand, ['--yes', '--dataset=test', '--project==test'], {
      mocks: {
        token: 'test-token',
      },
    })

    expect(error?.message).toContain(
      'Must be logged in to run this command in unattended mode, run `sanity login`',
    )
  })

  test('calls login when token invalid and not in unattended mode', async () => {
    mockGetById.mockRejectedValueOnce(new Error('Invalid token'))

    const {error} = await testCommand(InitCommand, [], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error).toBe(undefined)
    expect(mockLogin).toHaveBeenCalled()
  })
})
