import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures.js'
import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations.js'
import {PROJECTS_API_VERSION} from '../../../services/projects.js'
import {InitCommand} from '../../init.js'

const mockGetById = vi.hoisted(() => vi.fn())
const mockLogin = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()

  const globalTestClient = createTestClient({
    apiVersion: 'v2025-05-14',
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
    getProjectCliClient: vi.fn().mockImplementation(async (options) => {
      const client = createTestClient({
        apiVersion: options.apiVersion,
        token: 'test-token',
      })

      return {
        datasets: {
          list: vi.fn().mockResolvedValue([{aclMode: 'public', name: 'test'}]),
        },
        request: client.request,
      }
    }),
  }
})

vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: vi.fn().mockResolvedValue({
    name: 'Next.js',
    slug: 'nextjs',
  }),
}))

vi.mock('../../../actions/auth/login/login.js', () => ({
  login: mockLogin,
}))

// Below mocks are to make sure rest of command resolves successfully after authentication
vi.mock('../../../util/getProjectDefaults.js', () => ({
  getProjectDefaults: vi.fn().mockResolvedValue({
    author: undefined,
    description: '',
    gitRemote: '',
    license: 'UNLICENSED',
    projectName: 'test-project',
  }),
}))

vi.mock('../../../actions/mcp/setupMCP.js', () => ({
  setupMCP: vi.fn().mockResolvedValue({
    configuredEditors: [],
    detectedEditors: [],
    error: undefined,
    skipped: false,
  }),
}))

vi.mock('../../../actions/init/checkNextJsReactCompatibility.js', () => ({
  checkNextJsReactCompatibility: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../actions/init/bootstrapTemplate.js', () => ({
  bootstrapTemplate: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../actions/init/resolvePackageManager.js', () => ({
  resolvePackageManager: vi.fn().mockResolvedValue('npm'),
}))

vi.mock('../../../util/packageManager/installPackages.js', () => ({
  installDeclaredPackages: vi.fn().mockResolvedValue(undefined),
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

  mockApi({
    apiVersion: PROJECTS_API_VERSION,
    method: 'get',
    uri: '/projects/test',
  }).reply(200, {
    id: 'test',
    metadata: {cliInitializedAt: ''},
  })
}

const defaultMocks = {
  projectRoot: {
    directory: '/test/work/dir',
    path: '/test/work/dir',
    type: 'studio' as const,
  },
  token: 'test-token',
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

    const {error, stdout} = await testCommand(
      InitCommand,
      [
        '--dataset=test',
        '--project=test',
        '--no-nextjs-add-config-files',
        '--no-nextjs-append-env',
        '--no-nextjs-embed-studio',
        '--no-typescript',
        '--output-path=/test/output',
        '--no-overwrite-files',
        '--template=clean',
      ],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    if (error) throw error
    expect(stdout).toContain('You are logged in as test@example.com using SAML')
  })

  test('throws error if user is authenticated with invalid token in unattended mode', async () => {
    mockGetById.mockRejectedValueOnce(new Error('Invalid token'))

    const {error} = await testCommand(InitCommand, ['--yes', '--dataset=test', '--project=test'], {
      mocks: {
        ...defaultMocks,
      },
    })

    expect(error?.message).toContain(
      'Must be logged in to run this command in unattended mode, run `sanity login`',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('calls login when token invalid and not in unattended mode', async () => {
    mockGetById.mockRejectedValueOnce(new Error('Invalid token'))

    setupInitSuccessMocks()
    const {error} = await testCommand(
      InitCommand,
      [
        '--dataset=test',
        '--project=test',
        '--no-nextjs-add-config-files',
        '--no-nextjs-append-env',
        '--no-nextjs-embed-studio',
        '--no-typescript',
        '--output-path=/test/output',
        '--no-overwrite-files',
        '--template=clean',
      ],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    if (error) throw error
    expect(mockLogin).toHaveBeenCalled()
  })
})
