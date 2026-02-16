import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {INIT_API_VERSION} from '../../../actions/init/constants.js'
import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures.js'
import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations.js'
import {PROJECTS_API_VERSION} from '../../../services/projects.js'
import {InitCommand} from '../../init.js'

const mockConfirm = vi.hoisted(() => vi.fn())
const mockDetectedFramework = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual('@sanity/cli-core/ux')

  return {
    ...actual,
    confirm: mockConfirm,
  }
})

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: mockDetectedFramework,
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockImplementation(async (options) => {
      // Create a new client each time with the requested API version
      const testClient = createTestClient({
        apiVersion: options?.apiVersion || 'v2025-05-14',
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
        request: testClient.request,
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
      // Create a new client each time with the requested API version
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

// Below mocks are to make sure rest of command resolves successfully after plan logic
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

describe('#init: retrieving plan', () => {
  beforeEach(() => {
    mockDetectedFramework.mockResolvedValue({
      name: 'Next.js',
      slug: 'nextjs',
    })
  })
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('validates coupon when --coupon flag is provided', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/coupon/TESTCOUPON123',
    }).reply(200, [{id: 'test-plan-id'}])
    mockDetectedFramework.mockResolvedValue(undefined)

    setupInitSuccessMocks()

    const {stdout} = await testCommand(
      InitCommand,
      [
        '--coupon=TESTCOUPON123',
        '--project=test',
        '--dataset=test',
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

    expect(stdout).toContain('Coupon "TESTCOUPON123" validated!')
  })

  test('throws error if coupon not found with provided code', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/coupon/TESTCOUPON123',
    }).reply(200, [])

    const {error} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123', '--bare'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error?.message).toContain('Unable to validate coupon, please try again later:')
    expect(error?.message).toContain('No plans found for coupon code "TESTCOUPON123"')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error if coupon does not have attached plan id', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/coupon/TESTCOUPON123',
    }).reply(200, [{id: undefined}])

    const {error} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123', '--bare'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error?.message).toContain('Unable to validate coupon, please try again later:')
    expect(error?.message).toContain('Unable to find a plan from coupon code')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('uses default plan when coupon does not exist and cli in unattended mode', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/coupon/INVALID123',
    }).reply(404, {message: 'Coupon not found'})

    // Mock to resolve rest of command successfully
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      method: 'get',
      uri: '/projects/test',
    }).reply(200, {
      id: 'test',
      metadata: {},
    })

    const {error, stderr, stdout} = await testCommand(
      InitCommand,
      ['--coupon=INVALID123', '--yes', '--dataset=test', '--project=test'],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    if (error) throw error
    expect(stderr).toContain('Warning: Coupon "INVALID123" is not available - using default plan')
    expect(stdout).toContain('Using default plan.')
  })

  test('uses default plan when coupon invalid and user confirms default plan', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/coupon/INVALID123',
    }).reply(404, {message: 'Coupon not found'})

    mockConfirm.mockResolvedValue(true)

    setupInitSuccessMocks()

    const {error, stdout} = await testCommand(
      InitCommand,
      [
        '--coupon=INVALID123',
        '--project=test',
        '--dataset=test',
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
    expect(mockConfirm).toHaveBeenCalledWith({
      default: true,
      message: 'Coupon "INVALID123" is not available, use default plan instead?',
    })
    expect(stdout).toContain('Using default plan.')
  })

  test('throws error when coupon invalid and user declines the default plan', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/coupon/INVALID123',
    }).reply(404, {message: 'Coupon not found'})
    mockConfirm.mockResolvedValue(false)

    const {error} = await testCommand(InitCommand, ['--coupon=INVALID123'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error?.message).toContain('Coupon "INVALID123" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('returns when client request for plan is successful', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/growth',
    }).reply(200, [{id: 'test-plan-id'}])

    setupInitSuccessMocks()

    const {error} = await testCommand(
      InitCommand,
      [
        '--project-plan=growth',
        '--project=test',
        '--dataset=test',
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
  })

  test('throw error when no plan id is returned by request', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/growth',
    }).reply(200, [{id: undefined}])

    const {error} = await testCommand(InitCommand, ['--project-plan=growth'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error?.message).toContain('Unable to validate plan, please try again later:')
    expect(error?.message).toContain('Unable to find a plan with id growth')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('uses default plan when plan id does not exist and cli in unattended mode', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/growth',
    }).reply(404, {message: 'Plan not found'})

    // Mock to resolve rest of command successfully
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      method: 'get',
      uri: '/projects/test',
    }).reply(200, {
      id: 'test',
      metadata: {},
    })

    const {error, stderr, stdout} = await testCommand(
      InitCommand,
      ['--project-plan=growth', '--yes', '--dataset=test', '--project=test'],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    if (error) throw error
    expect(stderr).toContain('Warning: Project plan "growth" does not exist - using default plan')
    expect(stdout).toContain('Using default plan.')
  })

  test('uses default plan when plan ID not found and user confirms default plan', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/growth',
    }).reply(404, {message: 'Plan not found'})
    mockConfirm.mockResolvedValue(true)

    setupInitSuccessMocks()

    const {error, stdout} = await testCommand(
      InitCommand,
      [
        '--project-plan=growth',
        '--project=test',
        '--dataset=test',
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
    expect(mockConfirm).toHaveBeenCalledWith({
      default: true,
      message: 'Project plan "growth" does not exist, use default plan instead?',
    })
    expect(stdout).toContain('Using default plan.')
  })

  test('throws error when plan ID not found and user declines default plan', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/growth',
    }).reply(404, {message: 'Plan not found'})
    mockConfirm.mockResolvedValue(false)

    const {error} = await testCommand(InitCommand, ['--project-plan=growth'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error?.message).toContain('Plan id "growth" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })
})
