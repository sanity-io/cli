import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../../init'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  request: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual('@sanity/cli-core/ux')

  return {
    ...actual,
    confirm: mocks.confirm,
  }
})

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: vi.fn().mockResolvedValue({
    name: 'Next.js',
    slug: 'nextjs',
  }),
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/services/apiClient.js', () => ({
  getGlobalCliClient: vi.fn().mockResolvedValue({
    request: mocks.request,
  }),
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

const httpError = Object.assign(new Error('Not Found'), {
  message: 'Coupon not found',
  response: {
    body: {},
    headers: {},
    method: '',
    statusCode: 404,
    url: '',
  },
  statusCode: 404,
})

describe('#init: retrieving plan', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('validates coupon when --coupon flag is provided', async () => {
    mocks.request.mockResolvedValueOnce([{id: 'test-plan-id'}])

    const {error, stdout} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123'])

    expect(error).toBeUndefined()
    expect(mocks.request).toHaveBeenCalledWith({uri: 'plans/coupon/TESTCOUPON123'})
    expect(stdout).toContain('Coupon "TESTCOUPON123" validated!')
  })

  test('throws error if coupon not found with provided code', async () => {
    mocks.request.mockResolvedValueOnce([])

    const {error} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123', '--bare'])

    expect(mocks.request).toHaveBeenCalledWith({uri: 'plans/coupon/TESTCOUPON123'})
    expect(error?.message).toContain('Unable to validate coupon, please try again later:')
    expect(error?.message).toContain('No plans found for coupon code "TESTCOUPON123"')
  })

  test('throws error if coupon does not have attached plan id', async () => {
    mocks.request.mockResolvedValueOnce([{id: undefined}])

    const {error} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123', '--bare'])

    expect(mocks.request).toHaveBeenCalledWith({uri: 'plans/coupon/TESTCOUPON123'})
    expect(error?.message).toContain('Unable to validate coupon, please try again later:')
    expect(error?.message).toContain('Unable to find a plan from coupon code')
  })

  test('uses default plan when coupon does not exist and cli in unattended mode', async () => {
    mocks.request.mockRejectedValueOnce(httpError)

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

  test('uses default plan when user says confirms yes', async () => {
    mocks.request.mockRejectedValueOnce(httpError)
    mocks.confirm.mockResolvedValue(true)

    const {error, stdout} = await testCommand(InitCommand, ['--coupon=INVALID123'])

    expect(error).toBeUndefined()
    expect(mocks.confirm).toHaveBeenCalledWith({
      default: true,
      message: 'Coupon "INVALID123" is not available, use default plan instead?',
    })
    expect(stdout).toContain('Using default plan.')
  })

  test('throws error when user confirms no to use default plans', async () => {
    mocks.request.mockRejectedValueOnce(httpError)
    mocks.confirm.mockResolvedValue(false)

    const {error} = await testCommand(InitCommand, ['--coupon=INVALID123'])

    expect(error?.message).toContain('Coupon "INVALID123" does not exist')
  })

  test('returns when client request for plan is successful', async () => {
    mocks.request.mockResolvedValueOnce([{id: 'test-plan-id'}])

    const {error} = await testCommand(InitCommand, ['--project-plan=growth'])

    expect(error).toBeUndefined()
    expect(mocks.request).toHaveBeenCalledWith({uri: 'plans/growth'})
  })

  test('throw error when no plan id is returned by request', async () => {
    mocks.request.mockResolvedValueOnce([{id: undefined}])

    const {error} = await testCommand(InitCommand, ['--project-plan=growth'])
    expect(error?.message).toContain('Unable to validate plan, please try again later:')
    expect(error?.message).toContain('Unable to find a plan with id growth')
  })

  test('uses default plan when plan id does not exist and cli in unattended mode', async () => {
    mocks.request.mockRejectedValueOnce(httpError)

    const {error, stderr, stdout} = await testCommand(InitCommand, [
      '--project-plan=growth',
      '--yes',
      '--dataset=test',
      '--project==test',
    ])

    expect(error).toBe(undefined)
    expect(stderr).toContain('Warning: Project plan "growth" does not exist - using default plan')
    expect(stdout).toContain('Using default plan.')
  })

  test('uses default plan when user says confirms yes', async () => {
    mocks.request.mockRejectedValueOnce(httpError)
    mocks.confirm.mockResolvedValue(true)

    const {error, stdout} = await testCommand(InitCommand, ['--project-plan=growth'])

    expect(error).toBeUndefined()
    expect(mocks.confirm).toHaveBeenCalledWith({
      default: true,
      message: 'Project plan "growth" does not exist, use default plan instead?',
    })
    expect(stdout).toContain('Using default plan.')
  })

  test('throws error when user says confirms no', async () => {
    mocks.request.mockRejectedValueOnce(httpError)
    mocks.confirm.mockResolvedValue(false)

    const {error} = await testCommand(InitCommand, ['--project-plan=growth'])

    expect(error?.message).toContain('Plan id "growth" does not exist')
  })
})
