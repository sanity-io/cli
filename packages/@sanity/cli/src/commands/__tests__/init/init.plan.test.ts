import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {INIT_API_VERSION} from '../../../actions/init/constants.js'
import {InitCommand} from '../../init'

const mockConfirm = vi.hoisted(() => vi.fn())
const mockDetectedFramework = vi.hoisted(vi.fn())

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

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  const testClient = createTestClient({
    apiVersion: INIT_API_VERSION,
    token: 'test-token',
  })

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: testClient.request,
      users: {
        getById: vi.fn().mockResolvedValue({
          email: 'test@example.com',
          id: 'user-123',
          name: 'Test User',
          provider: 'saml-123',
        }),
      } as never,
    }),
  }
})

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

describe('#init: retrieving plan', () => {
  beforeEach(() => {
    mockDetectedFramework.mockResolvedValue({
      name: 'Next.js',
      slug: 'nextjs',
    })
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('validates coupon when --coupon flag is provided', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/coupon/TESTCOUPON123',
    }).reply(200, [{id: 'test-plan-id'}])
    mockDetectedFramework.mockResolvedValue(undefined)

    const {error, stdout} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

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
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error?.message).toContain('Unable to validate coupon, please try again later:')
    expect(error?.message).toContain('No plans found for coupon code "TESTCOUPON123"')
  })

  test('throws error if coupon does not have attached plan id', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/coupon/TESTCOUPON123',
    }).reply(200, [{id: undefined}])

    const {error} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123', '--bare'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error?.message).toContain('Unable to validate coupon, please try again later:')
    expect(error?.message).toContain('Unable to find a plan from coupon code')
  })

  test('uses default plan when coupon does not exist and cli in unattended mode', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/coupon/INVALID123',
    }).reply(404, {message: 'Coupon not found'})

    const {error, stderr, stdout} = await testCommand(
      InitCommand,
      ['--coupon=INVALID123', '--yes', '--dataset=test', '--project=test'],
      {
        mocks: {
          token: 'test-token',
        },
      },
    )

    expect(error).toBe(undefined)
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

    const {error, stdout} = await testCommand(InitCommand, ['--coupon=INVALID123'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error).toBeUndefined()
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
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error?.message).toContain('Coupon "INVALID123" does not exist')
  })

  test('returns when client request for plan is successful', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/growth',
    }).reply(200, [{id: 'test-plan-id'}])

    const {error} = await testCommand(InitCommand, ['--project-plan=growth'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error).toBeUndefined()
  })

  test('throw error when no plan id is returned by request', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/growth',
    }).reply(200, [{id: undefined}])

    const {error} = await testCommand(InitCommand, ['--project-plan=growth'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })
    expect(error?.message).toContain('Unable to validate plan, please try again later:')
    expect(error?.message).toContain('Unable to find a plan with id growth')
  })

  test('uses default plan when plan id does not exist and cli in unattended mode', async () => {
    mockApi({
      apiVersion: INIT_API_VERSION,
      method: 'get',
      uri: '/plans/growth',
    }).reply(404, {message: 'Plan not found'})

    const {error, stderr, stdout} = await testCommand(
      InitCommand,
      ['--project-plan=growth', '--yes', '--dataset=test', '--project==test'],
      {
        mocks: {
          token: 'test-token',
        },
      },
    )

    expect(error).toBe(undefined)
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

    const {error, stdout} = await testCommand(InitCommand, ['--project-plan=growth'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error).toBeUndefined()
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
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error?.message).toContain('Plan id "growth" does not exist')
  })
})
