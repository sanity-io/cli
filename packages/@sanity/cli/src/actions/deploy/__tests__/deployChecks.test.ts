import {beforeEach, describe, expect, test, vi} from 'vitest'

import {type UserApplication} from '../../../services/userApplications.js'
import {
  checkAppTarget,
  checkStudioTarget,
  createAggregatingChecks,
  type DeployTarget,
} from '../deployChecks.js'
import {resolveAppDeployTarget, resolveStudioDeployTarget} from '../resolveDeployTarget.js'

vi.mock('../resolveDeployTarget.js', () => ({
  resolveAppDeployTarget: vi.fn(),
  resolveStudioDeployTarget: vi.fn(),
}))

const mockResolveStudio = vi.mocked(resolveStudioDeployTarget)
const mockResolveApp = vi.mocked(resolveAppDeployTarget)

function application(overrides: Partial<UserApplication> = {}): UserApplication {
  return {
    appHost: 'my-studio',
    createdAt: '2024-01-01T00:00:00Z',
    id: 'app-1',
    organizationId: null,
    projectId: 'project-1',
    title: null,
    type: 'studio',
    updatedAt: '2024-01-01T00:00:00Z',
    urlType: 'internal',
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('createAggregatingChecks', () => {
  test('records checks without exiting', () => {
    const checks = createAggregatingChecks()
    checks.add({message: 'ok', name: 'a', status: 'pass'})
    checks.add({message: 'bad', name: 'b', status: 'fail'})
    expect(checks.all()).toHaveLength(2)
  })

  test('a thrown step becomes a fail check', async () => {
    const checks = createAggregatingChecks()
    const result = await checks.run('boom', async () => {
      throw new Error('nope')
    })
    expect(result).toBeNull()
    expect(checks.all()[0]).toMatchObject({name: 'boom', status: 'fail'})
    expect(checks.all()[0]?.message).toContain('nope')
  })

  test('run returns the value when the step succeeds', async () => {
    const checks = createAggregatingChecks()
    const result = await checks.run('ok', async () => 42)
    expect(result).toBe(42)
    expect(checks.all()).toHaveLength(0)
  })
})

const studioArgs = {
  appId: undefined,
  isExternal: false,
  projectId: 'project-1',
  studioHost: undefined,
  urlFlag: undefined,
}

describe('checkStudioTarget', () => {
  test('found → pass check and an existing target', async () => {
    mockResolveStudio.mockResolvedValue({application: application(), type: 'found'})
    const checks = createAggregatingChecks()

    const target: DeployTarget | null = await checkStudioTarget(checks, studioArgs)

    expect(target).toEqual({appId: 'app-1', exists: true, host: 'my-studio', type: 'studio'})
    expect(checks.all()).toContainEqual(expect.objectContaining({name: 'target', status: 'pass'}))
  })

  test('would-create → pass check and a to-be-created target', async () => {
    mockResolveStudio.mockResolvedValue({appHost: 'new-studio', type: 'would-create'})
    const checks = createAggregatingChecks()

    const target = await checkStudioTarget(checks, studioArgs)

    expect(target).toEqual({appId: null, exists: false, host: 'new-studio', type: 'studio'})
    expect(checks.all()[0]?.status).toBe('pass')
  })

  test('needs-input → fail check (unattended cannot prompt)', async () => {
    mockResolveStudio.mockResolvedValue({existing: [], type: 'needs-input'})
    const checks = createAggregatingChecks()

    const target = await checkStudioTarget(checks, studioArgs)

    expect(target).toBeNull()
    expect(checks.all()[0]).toMatchObject({name: 'target', status: 'fail'})
    expect(checks.all()[0]?.message).toContain('Cannot prompt for studio hostname')
  })

  test('invalid → fail check with the resolution message', async () => {
    mockResolveStudio.mockResolvedValue({
      message: 'Cannot find app with app ID nope',
      reason: 'app-not-found',
      type: 'invalid',
    })
    const checks = createAggregatingChecks()

    const target = await checkStudioTarget(checks, {...studioArgs, appId: 'nope'})

    expect(target).toBeNull()
    expect(checks.all()[0]).toMatchObject({
      message: 'Cannot find app with app ID nope',
      status: 'fail',
    })
  })

  test('blocked → skip check', async () => {
    mockResolveStudio.mockResolvedValue({message: 'api.projectId is missing', type: 'blocked'})
    const checks = createAggregatingChecks()

    const target = await checkStudioTarget(checks, studioArgs)

    expect(target).toBeNull()
    expect(checks.all()[0]?.status).toBe('skip')
  })

  test('a thrown resolution becomes a fail check', async () => {
    mockResolveStudio.mockRejectedValue(new Error('network down'))
    const checks = createAggregatingChecks()

    const target = await checkStudioTarget(checks, studioArgs)

    expect(target).toBeNull()
    expect(checks.all()[0]?.message).toContain('Failed to resolve deploy target: network down')
  })
})

describe('checkAppTarget', () => {
  test('found → pass check, existing app and target', async () => {
    const app = application({appHost: 'app-host', id: 'core-1', title: 'My App', type: 'coreApp'})
    mockResolveApp.mockResolvedValue({application: app, type: 'found'})
    const checks = createAggregatingChecks()

    const {existingApp, target} = await checkAppTarget(checks, {
      appId: 'core-1',
      organizationId: 'org-1',
    })

    expect(existingApp).toBe(app)
    expect(target).toEqual({appId: 'core-1', exists: true, host: 'app-host', type: 'coreApp'})
    expect(checks.all()[0]?.message).toContain('Deploys to existing application "My App"')
  })

  test('would-create → pass check, no existing app', async () => {
    mockResolveApp.mockResolvedValue({type: 'would-create'})
    const checks = createAggregatingChecks()

    const {existingApp, target} = await checkAppTarget(checks, {
      appId: undefined,
      organizationId: 'org-1',
    })

    expect(existingApp).toBeNull()
    expect(target).toEqual({appId: null, exists: false, host: null, type: 'coreApp'})
  })

  test('needs-input → fail check (would prompt)', async () => {
    mockResolveApp.mockResolvedValue({
      existing: [application(), application()],
      type: 'needs-input',
    })
    const checks = createAggregatingChecks()

    const {target} = await checkAppTarget(checks, {appId: undefined, organizationId: 'org-1'})

    expect(target).toBeNull()
    expect(checks.all()[0]).toMatchObject({name: 'target', status: 'fail'})
    expect(checks.all()[0]?.message).toContain('2 existing applications found')
  })

  test('invalid → fail check', async () => {
    mockResolveApp.mockResolvedValue({
      message: 'Cannot find app with app ID nope',
      reason: 'app-not-found',
      type: 'invalid',
    })
    const checks = createAggregatingChecks()

    const {target} = await checkAppTarget(checks, {appId: 'nope', organizationId: 'org-1'})

    expect(target).toBeNull()
    expect(checks.all()[0]?.status).toBe('fail')
  })

  test('a 403 becomes a permissions fail check', async () => {
    mockResolveApp.mockRejectedValue(Object.assign(new Error('forbidden'), {statusCode: 403}))
    const checks = createAggregatingChecks()

    const {target} = await checkAppTarget(checks, {appId: undefined, organizationId: 'org-1'})

    expect(target).toBeNull()
    expect(checks.all()[0]?.message).toContain('don’t have permission')
  })
})
