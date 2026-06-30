import {beforeEach, describe, expect, test, vi} from 'vitest'

import {type UserApplication} from '../../../services/userApplications.js'
import {checkAppTarget, checkAutoUpdates, createAggregatingChecks} from '../deployChecks.js'
import {resolveAppDeployTarget} from '../resolveDeployTarget.js'
import {type DeployFlags} from '../types.js'

vi.mock('../resolveDeployTarget.js', () => ({
  resolveAppDeployTarget: vi.fn(),
}))

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
    expect(target).toEqual({
      appId: 'core-1',
      exists: true,
      host: 'app-host',
      isExternal: false,
      type: 'coreApp',
    })
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
    expect(target).toEqual({
      appId: null,
      exists: false,
      host: null,
      isExternal: false,
      type: 'coreApp',
    })
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

describe('checkAutoUpdates', () => {
  test('a config conflict is a fail check', () => {
    const checks = createAggregatingChecks()

    const enabled = checkAutoUpdates(checks, {
      cliConfig: {autoUpdates: true, deployment: {autoUpdates: false}},
      flags: {} as DeployFlags,
    })

    expect(enabled).toBe(false)
    expect(checks.all()).toEqual([expect.objectContaining({name: 'auto-updates', status: 'fail'})])
  })

  test('the deprecated top-level config warns and includes the migration edit', () => {
    const checks = createAggregatingChecks()

    const enabled = checkAutoUpdates(checks, {
      cliConfig: {autoUpdates: true},
      flags: {} as DeployFlags,
    })

    expect(enabled).toBe(true)
    const all = checks.all()
    expect(all).toHaveLength(2)
    expect(all.every((c) => c.name === 'auto-updates' && c.status === 'warn')).toBe(true)
    expect(all[0]?.message).toContain('autoUpdates config has moved')
    expect(all[1]?.message).toContain('Please update sanity.cli.ts')
    expect(all[1]?.message).toContain('deployment: {autoUpdates: true}')
  })

  test('a deprecated flag warns', () => {
    const checks = createAggregatingChecks()

    checkAutoUpdates(checks, {cliConfig: {}, flags: {'auto-updates': true} as DeployFlags})

    expect(checks.all()).toEqual([expect.objectContaining({name: 'auto-updates', status: 'warn'})])
  })

  test('a clean config records no check', () => {
    const checks = createAggregatingChecks()

    checkAutoUpdates(checks, {
      cliConfig: {deployment: {autoUpdates: true}},
      flags: {} as DeployFlags,
    })

    expect(checks.all()).toHaveLength(0)
  })
})
