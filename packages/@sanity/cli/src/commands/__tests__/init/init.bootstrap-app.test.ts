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
  installDeclaredPackages: vi.fn(),
  select: vi.fn(),
  setupMCP: vi.fn(),
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

const defaultMocks = {
  projectRoot: {
    directory: '/test/work/dir',
    path: '/test/work/dir',
    type: 'studio' as const,
  },
  token: 'test-token',
}

mocks.createOrAppendEnvVars.mockResolvedValue(undefined)

describe('#init: bootstrap-app-initialization', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })
  test('initializes app without env files', async () => {
    setupInitSuccessMocks()

    mocks.select.mockResolvedValueOnce('blog') // template

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
    }).reply(200, {
      message: 'Setup your Cursor IDE',
    })

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

    expect(mocks.bootstrapTemplate).toHaveBeenCalledWith({
      autoUpdates: true,
      bearerToken: undefined,
      dataset: 'test',
      organizationId: undefined,
      output: expect.any(Object),
      outputPath: convertToSystemPath('/test/output'),
      overwriteFiles: undefined,
      packageName: 'test',
      projectId: 'test',
      projectName: 'Test',
      remoteTemplateInfo: undefined,
      schemaUrl: undefined,
      templateName: 'blog',
      useTypeScript: true,
    })
    expect(stdout).toContain('Success! Your Studio has been created')
    expect(stdout).toContain(
      `(cd ${convertToSystemPath('/test/output')} to navigate to your new project directory)`,
    )
    expect(stdout).toContain('Get started by running npm run dev')
    expect(stdout).toContain('Setup your Cursor IDE')
    expect(stdout).toContain('Learn more: https://mcp.sanity.io')
    expect(stdout).toContain(
      'Have feedback? Tell us in the community: https://www.sanity.io/community/join',
    )
    expect(stdout).toContain('npx sanity docs browse')
    expect(stdout).toContain('npx sanity manage')
    expect(stdout).toContain('npx sanity help')
  })

  test('initializes app with env file', async () => {
    setupInitSuccessMocks()

    mocks.select.mockResolvedValueOnce('blog') // template

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

    // Exits early without calling rest of templating code
    expect(error?.oclif?.exit).toBe(0)
  })

  test('initializes app-quickstart template with app-specific output', async () => {
    // Reset select mock to clear any unconsumed mockResolvedValueOnce from prior tests
    mocks.select.mockReset()

    // Mock organizations endpoint with app-specific query params
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      query: {includeImplicitMemberships: 'true', includeMembers: 'true'},
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    // select is called once for organization selection (template comes from --template flag)
    mocks.select.mockResolvedValueOnce('org-1') // organization

    mockApi({
      apiVersion: MCP_JOURNEY_API_VERSION,
      method: 'get',
      uri: '/journey/mcp/post-init-prompt',
    }).reply(200, {
      message: 'Setup your Cursor IDE',
    })

    const {stdout} = await testCommand(
      InitCommand,
      [
        '--template=app-quickstart',
        '--output-path=/test/output',
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

    expect(mocks.bootstrapTemplate).toHaveBeenCalledWith({
      autoUpdates: true,
      bearerToken: undefined,
      dataset: '',
      organizationId: 'org-1',
      output: expect.any(Object),
      outputPath: convertToSystemPath('/test/output'),
      overwriteFiles: undefined,
      packageName: '',
      projectId: '',
      projectName: 'test-project',
      remoteTemplateInfo: undefined,
      templateName: 'app-quickstart',
      useTypeScript: true,
    })

    // App-specific success message (not Studio message)
    expect(stdout).toContain('Your custom app has been scaffolded')
    expect(stdout).not.toContain('Your Studio has been created')

    // App-specific guidance
    expect(stdout).toContain('src/App.tsx')
    expect(stdout).toContain('https://www.sanity.io/docs/app-sdk/sdk-configuration')

    // App-specific commands (not Studio commands)
    expect(stdout).toContain('npx sanity dev')
    expect(stdout).toContain('npx sanity deploy')
    expect(stdout).toContain('npx sanity docs browse')
    expect(stdout).not.toContain('npx sanity manage')
    expect(stdout).not.toContain('npx sanity help')

    // MCP setup message
    expect(stdout).toContain('Setup your Cursor IDE')
    expect(stdout).toContain('Learn more: https://mcp.sanity.io')
  })

  test('initializes app in unattended mode', async () => {
    // Mock to resolve correctly up to initializing nextjs app
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    // Mocks to resolve app initialization
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

    const {stdout} = await testCommand(
      InitCommand,
      [
        '--yes',
        '--output-path=/test/output',
        '--project=test',
        '--dataset=test',
        '--package-manager=npm',
      ],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    expect(stdout).toContain('Success! Your Studio has been created')
    expect(stdout).toContain(
      `(cd ${convertToSystemPath('/test/output')} to navigate to your new project directory)`,
    )
    expect(stdout).toContain('Get started by running npm run dev')
    expect(stdout).toContain(
      'To set up your project with the MCP server, restart Cursor and type "Get started with Sanity" in the chat.',
    )
    expect(stdout).toContain('Learn more: https://mcp.sanity.io')
    expect(stdout).toContain(
      'Have feedback? Tell us in the community: https://www.sanity.io/community/join',
    )
    expect(stdout).toContain('npx sanity docs browse')
    expect(stdout).toContain('npx sanity manage')
    expect(stdout).toContain('npx sanity help')
  })
})
