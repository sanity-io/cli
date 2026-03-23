import {
  convertToSystemPath,
  createTestClient,
  mockApi,
  testCommand,
  testFixture,
} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {CORS_API_VERSION} from '../../../services/cors.js'
import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures.js'
import {MCP_JOURNEY_API_VERSION} from '../../../services/mcp.js'
import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations.js'
import {InitCommand} from '../../init.js'

const mocks = vi.hoisted(() => ({
  checkNextJsReactCompatibility: vi.fn(),
  confirm: vi.fn(),
  createOrAppendEnvVars: vi.fn(),
  execa: vi.fn(),
  existsSync: vi.fn(),
  getSanityEnv: vi.fn(),
  input: vi.fn(),
  installNewPackages: vi.fn(),
  mkdir: vi.fn(),
  select: vi.fn(),
  setupMCP: vi.fn(),
  writeFile: vi.fn(),
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

vi.mock('execa', () => ({
  execa: mocks.execa,
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: mocks.confirm,
    input: mocks.input,
    select: mocks.select,
  }
})

vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: vi.fn().mockResolvedValue({
    name: 'Next.js',
    slug: 'nextjs',
  }),
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

vi.mock('../../../actions/init/checkNextJsReactCompatibility.js', () => ({
  checkNextJsReactCompatibility: mocks.checkNextJsReactCompatibility.mockResolvedValue(undefined),
}))

vi.mock('../../../util/packageManager/installPackages.js', () => ({
  installNewPackages: mocks.installNewPackages.mockResolvedValue(undefined),
}))

vi.mock('../../../actions/init/env/createOrAppendEnvVars.js', () => ({
  createOrAppendEnvVars: mocks.createOrAppendEnvVars,
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
mocks.execa.mockResolvedValue(undefined)
mocks.getSanityEnv.mockReturnValue('production')

describe('#init:nextjs-app-initialization', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })
  test('initializes nextjs app', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)
    setupInitSuccessMocks()

    mocks.confirm.mockResolvedValueOnce(true) // nextjs-add-config-files
    mocks.confirm.mockResolvedValueOnce(true) // typescript
    mocks.input.mockResolvedValueOnce('/studio') // nextjs-embed-studio
    mocks.confirm.mockResolvedValueOnce('/studio') // studio path
    mocks.confirm.mockResolvedValueOnce(true) // template
    mocks.confirm.mockResolvedValueOnce(true) // nextjs-append-env

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'get',
      uri: '/projects/test/cors',
    }).reply(200, [])

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'post',
      uri: '/projects/test/cors',
    }).reply(200, {id: 'cors-id'})

    mockApi({
      apiVersion: MCP_JOURNEY_API_VERSION,
      method: 'get',
      uri: '/journey/mcp/post-init-prompt',
    }).reply(200, {
      message: 'Setup your Cursor IDE',
    })

    const {error, stdout} = await testCommand(
      InitCommand,
      ['--output-path=/test/output', '--project=test', '--dataset=test', '--package-manager=npm'],
      {
        config: {root: cwd},
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    expect(mocks.createOrAppendEnvVars).toHaveBeenCalledWith({
      envVars: {
        DATASET: 'test',
        PROJECT_ID: 'test',
      },
      filename: '.env.local',
      framework: {
        name: 'Next.js',
        slug: 'nextjs',
      },
      log: true,
      output: expect.any(Object),
      outputPath: cwd,
    })
    expect(mocks.checkNextJsReactCompatibility).toHaveBeenCalledWith({
      detectedFramework: {
        name: 'Next.js',
        slug: 'nextjs',
      },
      output: expect.any(Object),
      outputPath: convertToSystemPath('/test/output'),
    })
    expect(mocks.installNewPackages).toHaveBeenCalledWith(
      {
        packageManager: 'npm',
        packages: ['@sanity/vision@5', 'sanity@5', '@sanity/image-url@2', 'styled-components@6'],
      },
      {
        output: expect.any(Object),
        workDir: cwd,
      },
    )

    expect(stdout).toContain(
      'Success! Your Sanity configuration files has been added to this project',
    )
    expect(stdout).toContain('Setup your Cursor IDE')
    expect(stdout).toContain('Learn more: https://mcp.sanity.io')
    expect(stdout).toContain(
      'Have feedback? Tell us in the community: https://www.sanity.io/community/join',
    )

    if (error) throw error
  })

  test('initializes nextjs app in unattended mode', async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    // Mock to resolve correctly up to initializing nextjs app
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    // Mocks for nextjs initialization
    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'get',
      uri: '/projects/test/cors',
    }).reply(200, [
      {
        allowCredentials: true,
        createdAt: '2024-01-15T10:30:00.000Z',
        deletedAt: null,
        id: 1234,
        origin: 'http://localhost:3000',
        projectId: 'abc123xyz',
        updatedAt: '2024-01-20T14:45:00.000Z',
      },
    ])

    mockApi({
      apiVersion: MCP_JOURNEY_API_VERSION,
      method: 'get',
      uri: '/journey/mcp/post-init-prompt',
    }).reply(200, {})

    const {error, stdout} = await testCommand(
      InitCommand,
      ['--yes', '--project=test', '--dataset=test', '--nextjs-add-config-files'],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    expect(mocks.createOrAppendEnvVars).toHaveBeenCalledWith({
      envVars: {
        DATASET: 'test',
        PROJECT_ID: 'test',
      },
      filename: '.env.local',
      framework: {
        name: 'Next.js',
        slug: 'nextjs',
      },
      log: true,
      output: expect.any(Object),
      outputPath: cwd,
    })
    expect(mocks.checkNextJsReactCompatibility).toHaveBeenCalledWith({
      detectedFramework: {
        name: 'Next.js',
        slug: 'nextjs',
      },
      output: expect.any(Object),
      outputPath: cwd,
    })

    expect(stdout).toContain(
      'Success! Your Sanity configuration files has been added to this project',
    )
    expect(stdout).toContain(
      'To set up your project with the MCP server, restart Cursor and type "Get started with Sanity" in the chat.',
    )
    expect(stdout).toContain('Learn more: https://mcp.sanity.io')
    expect(stdout).toContain(
      'Have feedback? Tell us in the community: https://www.sanity.io/community/join',
    )

    if (error) throw error
  })

  test('writes SANITY_INTERNAL_ENV to .env when in staging', async () => {
    mocks.getSanityEnv.mockReturnValue('staging')

    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'get',
      uri: '/projects/test/cors',
    }).reply(200, [
      {
        allowCredentials: true,
        createdAt: '2024-01-15T10:30:00.000Z',
        deletedAt: null,
        id: 1234,
        origin: 'http://localhost:3000',
        projectId: 'abc123xyz',
        updatedAt: '2024-01-20T14:45:00.000Z',
      },
    ])

    mockApi({
      apiVersion: MCP_JOURNEY_API_VERSION,
      method: 'get',
      uri: '/journey/mcp/post-init-prompt',
    }).reply(200, {})

    const {error} = await testCommand(
      InitCommand,
      ['--yes', '--project=test', '--dataset=test', '--nextjs-add-config-files'],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    if (error) throw error

    // Called twice: once for project env vars (.env.local), once for staging env (.env)
    expect(mocks.createOrAppendEnvVars).toHaveBeenCalledTimes(2)

    // Staging env var written to .env (not .env.local)
    expect(mocks.createOrAppendEnvVars).toHaveBeenCalledWith({
      envVars: {INTERNAL_ENV: 'staging'},
      filename: '.env',
      framework: null,
      log: false,
      output: expect.any(Object),
      outputPath: cwd,
    })
  })
})
