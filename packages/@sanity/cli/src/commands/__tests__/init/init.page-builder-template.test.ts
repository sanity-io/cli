import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
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
  installDeclaredPackages: mocks.installDeclaredPackages,
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

mocks.createOrAppendEnvVars.mockResolvedValue(undefined)
mocks.installDeclaredPackages.mockResolvedValue(undefined)

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

describe('#init: page-builder template gating', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('includes page-builder template in choices when in non-production environment', async () => {
    mocks.getSanityEnv.mockReturnValue('staging')
    setupInitSuccessMocks()

    mocks.select.mockResolvedValueOnce('clean')

    const {error} = await testCommand(
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

    if (error) throw error

    const templateSelectCall = mocks.select.mock.calls.find(
      (args: unknown[]) => (args[0] as {message: string}).message === 'Select project template',
    )

    expect(templateSelectCall).toBeDefined()

    const selectOptions = templateSelectCall![0] as {
      choices: Array<{name: string; value: string}>
    }
    const templateValues = selectOptions.choices.map((choice) => choice.value)
    expect(templateValues).toContain('page-builder')
  })

  test('excludes page-builder template in choices when in production environment', async () => {
    mocks.getSanityEnv.mockReturnValue('production')
    setupInitSuccessMocks()

    mocks.select.mockResolvedValueOnce('clean')

    const {error} = await testCommand(
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

    if (error) throw error

    const templateSelectCall = mocks.select.mock.calls.find(
      (args: unknown[]) => (args[0] as {message: string}).message === 'Select project template',
    )

    expect(templateSelectCall).toBeDefined()

    const selectOptions = templateSelectCall![0] as {
      choices: Array<{name: string; value: string}>
    }
    const templateValues = selectOptions.choices.map((choice) => choice.value)
    expect(templateValues).not.toContain('page-builder')
  })
})
