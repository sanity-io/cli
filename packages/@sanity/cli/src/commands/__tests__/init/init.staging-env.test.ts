import {convertToSystemPath, createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures.js'
import {MCP_JOURNEY_API_VERSION} from '../../../services/mcp.js'
import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations.js'
import {PROJECTS_API_VERSION} from '../../../services/projects.js'
import {InitCommand} from '../../init.js'

const mocks = vi.hoisted(() => ({
  bootstrapTemplate: vi.fn(),
  createOrAppendEnvVars: vi.fn(),
  getSanityEnv: vi.fn(),
  installDeclaredPackages: vi.fn(),
  select: vi.fn(),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockImplementation(async (options) => {
      const globalTestClient = createTestClient({
        apiVersion: options.apiVersion,
        token: 'test-token',
      })

      return {
        projects: {
          list: vi
            .fn()
            .mockResolvedValue([
              {createdAt: '2024-01-01T00:00:00Z', displayName: 'Test', id: 'test'},
            ]),
        },
        request: globalTestClient.request,
        users: {
          getById: vi.fn().mockResolvedValue({
            email: 'test@example.com',
            id: 'user-123',
            name: 'Test User',
            provider: 'saml-123',
          }),
        } as never,
      }
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

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual('@sanity/cli-core/ux')
  return {
    ...actual,
    select: mocks.select,
  }
})

vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../util/getProjectDefaults.js', () => ({
  getProjectDefaults: vi.fn().mockResolvedValue({
    author: undefined,
    description: '',
    gitRemote: undefined,
    license: 'UNLICENSED',
    projectName: 'test-project',
  }),
}))

vi.mock('../../../actions/mcp/setupMCP.js', () => ({
  setupMCP: vi.fn().mockResolvedValue({
    alreadyConfiguredEditors: [],
    configuredEditors: ['Cursor'],
    detectedEditors: [],
    error: undefined,
    skipped: false,
  }),
}))

vi.mock('../../../util/packageManager/installPackages.js', () => ({
  installDeclaredPackages: mocks.installDeclaredPackages.mockResolvedValue(undefined),
}))

vi.mock('../../../actions/init/env/createOrAppendEnvVars.js', () => ({
  createOrAppendEnvVars: mocks.createOrAppendEnvVars,
}))

vi.mock('../../../actions/init/bootstrapTemplate.js', () => ({
  bootstrapTemplate: mocks.bootstrapTemplate,
}))

vi.mock('../../../actions/init/git.js', () => ({
  tryGitInit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../util/getSanityEnv.js', () => ({
  getSanityEnv: mocks.getSanityEnv,
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
    metadata: {
      cliInitializedAt: '',
    },
  })

  mockApi({
    apiVersion: MCP_JOURNEY_API_VERSION,
    method: 'get',
    uri: '/journey/mcp/post-init-prompt',
  }).reply(200, {})
}

const defaultMocks = {
  projectRoot: {
    directory: '/test/work/dir',
    path: '/test/work/dir',
    type: 'studio' as const,
  },
  token: 'test-token',
}

mocks.createOrAppendEnvVars.mockResolvedValue(undefined)

describe('#init: staging env propagation', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('writes SANITY_INTERNAL_ENV to .env when in staging (--env flag path)', async () => {
    mocks.getSanityEnv.mockReturnValue('staging')

    // The --env flag path exits early, so only organizations and features are needed
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

    const {error} = await testCommand(
      InitCommand,
      ['--output-path=/test/output', '--project=test', '--dataset=test', '--env=.env'],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    expect(error?.oclif?.exit).toBe(0)

    // Should be called twice: once for project env vars, once for staging env
    expect(mocks.createOrAppendEnvVars).toHaveBeenCalledTimes(2)

    // First call: regular env vars (framework is undefined since none detected)
    expect(mocks.createOrAppendEnvVars).toHaveBeenNthCalledWith(1, {
      envVars: {
        DATASET: 'test',
        PROJECT_ID: 'test',
      },
      filename: '.env',
      framework: undefined,
      log: false,
      output: expect.any(Object),
      outputPath: convertToSystemPath('/test/output'),
    })

    // Second call: staging env var
    expect(mocks.createOrAppendEnvVars).toHaveBeenNthCalledWith(2, {
      envVars: {INTERNAL_ENV: 'staging'},
      filename: '.env',
      framework: null,
      log: false,
      output: expect.any(Object),
      outputPath: convertToSystemPath('/test/output'),
    })
  })

  test('writes SANITY_INTERNAL_ENV to .env when in staging (template bootstrap path)', async () => {
    mocks.getSanityEnv.mockReturnValue('staging')
    setupInitSuccessMocks()

    mocks.select.mockResolvedValueOnce('blog') // template

    const {stdout} = await testCommand(
      InitCommand,
      [
        '--output-path=/test/output',
        '--project=test',
        '--dataset=test',
        '--package-manager=npm',
        '--typescript',
      ],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    expect(stdout).toContain('Success!')

    // Should be called once for staging env (no --env flag, so no regular env call)
    expect(mocks.createOrAppendEnvVars).toHaveBeenCalledTimes(1)
    expect(mocks.createOrAppendEnvVars).toHaveBeenCalledWith({
      envVars: {INTERNAL_ENV: 'staging'},
      filename: '.env',
      framework: null,
      log: false,
      output: expect.any(Object),
      outputPath: convertToSystemPath('/test/output'),
    })
  })

  test('does not write SANITY_INTERNAL_ENV when in production', async () => {
    mocks.getSanityEnv.mockReturnValue('production')
    setupInitSuccessMocks()

    mocks.select.mockResolvedValueOnce('blog') // template

    const {stdout} = await testCommand(
      InitCommand,
      [
        '--output-path=/test/output',
        '--project=test',
        '--dataset=test',
        '--package-manager=npm',
        '--typescript',
      ],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    expect(stdout).toContain('Success!')

    // Should not be called at all - no --env flag and production env
    expect(mocks.createOrAppendEnvVars).not.toHaveBeenCalled()
  })
})
