import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures'
import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations'
import {InitCommand} from '../../init'

const mockGetById = vi.hoisted(() => vi.fn())
const mockLogin = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()

  const globalTestClient = createTestClient({
    apiVersion: 'v2025-05-14',
    token: 'test-token',
  })

  const projectTestClient = createTestClient({
    apiVersion: 'v2025-09-16',
    token: 'test-token',
  })

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      projects: {
        list: vi
          .fn()
          .mockResolvedValue([
            {createdAt: '2024-01-01T00:00:00Z', displayName: 'Test', id: 'test'},
          ]),
      },
      request: globalTestClient.request,
      users: {
        getById: mockGetById,
      } as never,
    }),
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        list: vi.fn().mockResolvedValue([{aclMode: 'public', name: 'test'}]),
      },
      request: projectTestClient.request,
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

const setupInitSuccessMocks = () => {
  mockApi({
    apiVersion: ORGANIZATIONS_API_VERSION,
    method: 'get',
    uri: '/organizations',
  }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

  mockApi({
    apiVersion: PROJECT_FEATURES_API_VERSION,
    method: 'get',
    uri: '/features',
  }).reply(200, ['privateDataset'])
}

describe('#init: authentication', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('user is authenticated with valid token', async () => {
    mockGetById.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'saml-123',
    })

    setupInitSuccessMocks()

    const {error, stdout} = await testCommand(InitCommand, ['--dataset=test', '--project=test'], {
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

    const {error} = await testCommand(InitCommand, ['--yes', '--dataset=test', '--project=test'], {
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

    setupInitSuccessMocks()

    const {error} = await testCommand(InitCommand, ['--dataset=test', '--project=test'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error).toBe(undefined)
    expect(mockLogin).toHaveBeenCalled()
  })
})
