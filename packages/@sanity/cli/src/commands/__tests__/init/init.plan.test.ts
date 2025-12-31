import {mockApi, testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../../init'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  detectFramework: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual('@sanity/cli-core/ux')

  return {
    ...actual,
    confirm: mocks.confirm,
  }
})

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: mocks.detectFramework,
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/util/isInteractive.js', () => ({
  isInteractive: vi.fn().mockReturnValue(true),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../services/user.js', () => ({
  getCliUser: vi.fn().mockResolvedValue({
    email: 'test@example.com',
    id: 'user-123',
    name: 'Test User',
    provider: 'saml-123',
  }),
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

describe('#init: retrieving plan', () => {
  beforeEach(() => {
    mocks.detectFramework.mockResolvedValue({
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
    mocks.detectFramework.mockResolvedValue(undefined)

    const {stdout} = await testCommand(InitCommand, [
      '--coupon=TESTCOUPON123',
      '--project=test',
      '--dataset=test',
    ])

    expect(stdout).toContain('Coupon "TESTCOUPON123" validated!')
  })

  test('throws error if coupon not found with provided code', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/coupon/TESTCOUPON123',
    }).reply(200, [])

    const {error} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123', '--bare'])

    expect(error?.message).toContain('Unable to validate coupon, please try again later:')
    expect(error?.message).toContain('No plans found for coupon code "TESTCOUPON123"')
  })

  test('throws error if coupon does not have attached plan id', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/coupon/TESTCOUPON123',
    }).reply(200, [{id: undefined}])

    const {error} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123', '--bare'])

    expect(error?.message).toContain('Unable to validate coupon, please try again later:')
    expect(error?.message).toContain('Unable to find a plan from coupon code')
  })

  test('uses default plan when coupon does not exist and cli in unattended mode', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/coupon/INVALID123',
    }).reply(404, {message: 'Coupon not found'})

    const {error, stderr, stdout} = await testCommand(InitCommand, [
      '--coupon=INVALID123',
      '--yes',
      '--dataset=test',
      '--project=test',
    ])

    expect(error).toBe(undefined)
    expect(stderr).toContain('Warning: Coupon "INVALID123" is not available - using default plan')
    expect(stdout).toContain('Using default plan.')
  })

  test('uses default plan when coupon invalid and user confirms default plan', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/coupon/INVALID123',
    }).reply(404, {message: 'Coupon not found'})

    mocks.confirm.mockResolvedValue(true)

    const {stdout} = await testCommand(InitCommand, [
      '--coupon=INVALID123',
      '--project=test',
      '--dataset=test',
    ])

    expect(mocks.confirm).toHaveBeenCalledWith({
      default: true,
      message: 'Coupon "INVALID123" is not available, use default plan instead?',
    })
    expect(stdout).toContain('Using default plan.')
  })

  test('throws error when coupon invalid and user declines the default plan', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/coupon/INVALID123',
    }).reply(404, {message: 'Coupon not found'})
    mocks.confirm.mockResolvedValue(false)

    const {error} = await testCommand(InitCommand, ['--coupon=INVALID123'])

    expect(error?.message).toContain('Coupon "INVALID123" does not exist')
  })

  test('returns when client request for plan is successful', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/growth',
    }).reply(200, [{id: 'test-plan-id'}])

    const {error} = await testCommand(InitCommand, [
      '--project-plan=growth',
      '--project=test',
      '--dataset=test',
    ])

    expect(error).toBeUndefined()
  })

  test('throw error when no plan id is returned by request', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/growth',
    }).reply(200, [{id: undefined}])

    const {error} = await testCommand(InitCommand, ['--project-plan=growth'])
    expect(error?.message).toContain('Unable to validate plan, please try again later:')
    expect(error?.message).toContain('Unable to find a plan with id growth')
  })

  test('uses default plan when plan id does not exist and cli in unattended mode', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/growth',
    }).reply(404, {message: 'Plan not found'})

    const {error, stderr, stdout} = await testCommand(InitCommand, [
      '--project-plan=growth',
      '--yes',
      '--dataset=test',
      '--project=test',
    ])

    expect(error).toBe(undefined)
    expect(stderr).toContain('Warning: Project plan "growth" does not exist - using default plan')
    expect(stdout).toContain('Using default plan.')
  })

  test('uses default plan when plan ID not found and user confirms default plan', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/growth',
    }).reply(404, {message: 'Plan not found'})
    mocks.confirm.mockResolvedValue(true)

    const {error, stdout} = await testCommand(InitCommand, [
      '--project-plan=growth',
      '--project=test',
      '--dataset=test',
    ])

    expect(error).toBeUndefined()
    expect(mocks.confirm).toHaveBeenCalledWith({
      default: true,
      message: 'Project plan "growth" does not exist, use default plan instead?',
    })
    expect(stdout).toContain('Using default plan.')
  })

  test('throws error when plan ID not found and user declines default plan', async () => {
    mockApi({
      apiVersion: 'v2025-06-01',
      method: 'get',
      uri: '/plans/growth',
    }).reply(404, {message: 'Plan not found'})
    mocks.confirm.mockResolvedValue(false)

    const {error} = await testCommand(InitCommand, ['--project-plan=growth'])

    expect(error?.message).toContain('Plan id "growth" does not exist')
  })
})
