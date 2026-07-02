import {type Output} from '@sanity/cli-core'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {type UserApplication} from '../../../services/userApplications.js'
import {
  checkAppTarget,
  checkAutoUpdates,
  checkStudioTarget,
  createCollectingReporter,
  createFailFastReporter,
  runStep,
} from '../deployChecks.js'
import {resolveAppDeployTarget, resolveStudioDeployTarget} from '../resolveDeployTarget.js'
import {type DeployFlags} from '../types.js'

vi.mock('../resolveDeployTarget.js', () => ({
  resolveAppDeployTarget: vi.fn(),
  resolveStudioDeployTarget: vi.fn(),
}))

const mockResolveStudio = vi.mocked(resolveStudioDeployTarget)
const mockResolveApp = vi.mocked(resolveAppDeployTarget)

const mockOutput = () => ({error: vi.fn(), warn: vi.fn()}) as unknown as Output

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

describe('createFailFastReporter', () => {
  test('a fail exits with its exit code', () => {
    const output = mockOutput()
    createFailFastReporter(output).report({exitCode: 2, message: 'boom', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom', {exit: 2})
  })

  test('a fail without an exit code defaults to 1', () => {
    const output = mockOutput()
    createFailFastReporter(output).report({message: 'boom', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom', {exit: 1})
  })

  test('a warn prints and does not exit', () => {
    const output = mockOutput()
    createFailFastReporter(output).report({message: 'heads up', status: 'warn'})
    expect(output.warn).toHaveBeenCalledWith('heads up')
    expect(output.error).not.toHaveBeenCalled()
  })

  test('pass and skip are silent', () => {
    const output = mockOutput()
    const reporter = createFailFastReporter(output)
    reporter.report({message: 'good', status: 'pass'})
    reporter.report({message: 'skipped', status: 'skip'})
    expect(output.error).not.toHaveBeenCalled()
    expect(output.warn).not.toHaveBeenCalled()
  })

  test('a fail appends its solution to the message', () => {
    const output = mockOutput()
    createFailFastReporter(output).report({message: 'boom', solution: 'do X', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom: do X', {exit: 1})
  })

  test('a warn appends its solution to the message', () => {
    const output = mockOutput()
    createFailFastReporter(output).report({message: 'heads up', solution: 'do Y', status: 'warn'})
    expect(output.warn).toHaveBeenCalledWith('heads up: do Y')
  })
})

describe('createCollectingReporter', () => {
  test('collects every reported check on results', () => {
    const reporter = createCollectingReporter()
    reporter.report({message: 'ok', status: 'pass'})
    reporter.report({message: 'bad', status: 'fail'})
    expect(reporter.results).toHaveLength(2)
  })
})

describe('runStep', () => {
  test('returns the value when the work succeeds', async () => {
    const reporter = createCollectingReporter()
    const result = await runStep(reporter, 'ok', async () => 42)
    expect(result).toBe(42)
    expect(reporter.results).toHaveLength(0)
  })

  test('a throw becomes a fail check and returns null', async () => {
    const reporter = createCollectingReporter()
    const result = await runStep(reporter, 'boom', async () => {
      throw new Error('nope')
    })
    expect(result).toBeNull()
    expect(reporter.results[0]).toMatchObject({status: 'fail'})
    expect(reporter.results[0]?.message).toContain('nope')
  })

  test('uses a custom formatError for the fail message', async () => {
    const reporter = createCollectingReporter()
    await runStep(
      reporter,
      'boom',
      async () => {
        throw new Error('raw')
      },
      () => 'friendly',
    )
    expect(reporter.results[0]?.message).toBe('friendly')
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
  test('found → pass check for the existing studio', async () => {
    mockResolveStudio.mockResolvedValue({application: application(), type: 'found'})
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, studioArgs)

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain(
      'Deploys to existing studio https://my-studio.sanity.studio',
    )
  })

  test('would-create → pass check', async () => {
    mockResolveStudio.mockResolvedValue({appHost: 'new-studio', type: 'would-create'})
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, studioArgs)

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Would create studio hostname')
  })

  test('external would-create → pass check', async () => {
    mockResolveStudio.mockResolvedValue({
      appHost: 'https://studio.example.com',
      type: 'would-create',
    })
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, {...studioArgs, isExternal: true})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain(
      'Would register external studio at https://studio.example.com',
    )
  })

  test('needs-input → fail check (unattended cannot prompt)', async () => {
    mockResolveStudio.mockResolvedValue({existing: [], type: 'needs-input'})
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, studioArgs)

    expect(reporter.results[0]).toMatchObject({status: 'fail'})
    expect(reporter.results[0]?.message).toContain('Cannot prompt for studio hostname')
  })

  test('invalid → fail check with the resolution message', async () => {
    mockResolveStudio.mockResolvedValue({
      message: 'Cannot find app with app ID nope',
      reason: 'app-not-found',
      type: 'invalid',
    })
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, {...studioArgs, appId: 'nope'})

    expect(reporter.results[0]).toMatchObject({
      message: 'Cannot find app with app ID nope',
      status: 'fail',
    })
  })

  test('blocked → skip check', async () => {
    mockResolveStudio.mockResolvedValue({message: 'api.projectId is missing', type: 'blocked'})
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, studioArgs)

    expect(reporter.results[0]?.status).toBe('skip')
  })

  test('a thrown resolution becomes a fail check', async () => {
    mockResolveStudio.mockRejectedValue(new Error('network down'))
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, studioArgs)

    expect(reporter.results[0]?.message).toContain('Failed to resolve deploy target: network down')
  })
})

describe('checkAppTarget', () => {
  test('found → pass check for the existing application', async () => {
    const app = application({appHost: 'app-host', id: 'core-1', title: 'My App', type: 'coreApp'})
    mockResolveApp.mockResolvedValue({application: app, type: 'found'})
    const reporter = createCollectingReporter()

    await checkAppTarget(reporter, {appId: 'core-1', organizationId: 'org-1'})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Deploys to existing application "My App"')
  })

  test('would-create → pass check', async () => {
    mockResolveApp.mockResolvedValue({type: 'would-create'})
    const reporter = createCollectingReporter()

    await checkAppTarget(reporter, {appId: undefined, organizationId: 'org-1'})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Would create a new application deployment')
  })

  test('needs-input → fail check (would prompt)', async () => {
    mockResolveApp.mockResolvedValue({
      existing: [application(), application()],
      type: 'needs-input',
    })
    const reporter = createCollectingReporter()

    await checkAppTarget(reporter, {appId: undefined, organizationId: 'org-1'})

    expect(reporter.results[0]).toMatchObject({status: 'fail'})
    expect(reporter.results[0]?.message).toContain('2 existing applications found')
  })

  test('invalid → fail check', async () => {
    mockResolveApp.mockResolvedValue({
      message: 'Cannot find app with app ID nope',
      reason: 'app-not-found',
      type: 'invalid',
    })
    const reporter = createCollectingReporter()

    await checkAppTarget(reporter, {appId: 'nope', organizationId: 'org-1'})

    expect(reporter.results[0]?.status).toBe('fail')
    expect(reporter.results[0]?.solution).toContain('deployment.appId')
  })

  test('a 403 becomes a permissions fail check', async () => {
    mockResolveApp.mockRejectedValue(Object.assign(new Error('forbidden'), {statusCode: 403}))
    const reporter = createCollectingReporter()

    await checkAppTarget(reporter, {appId: undefined, organizationId: 'org-1'})

    expect(reporter.results[0]?.status).toBe('fail')
    expect(reporter.results[0]?.message).toContain('don’t have permission')
  })
})

describe('checkAutoUpdates', () => {
  test('a config conflict is a fail check', () => {
    const reporter = createCollectingReporter()

    const enabled = checkAutoUpdates(reporter, {
      cliConfig: {autoUpdates: true, deployment: {autoUpdates: false}},
      flags: {} as DeployFlags,
    })

    expect(enabled).toBe(false)
    expect(reporter.results).toEqual([expect.objectContaining({status: 'fail'})])
  })

  test('the deprecated top-level config warns and includes the migration edit', () => {
    const reporter = createCollectingReporter()

    const enabled = checkAutoUpdates(reporter, {
      cliConfig: {autoUpdates: true},
      flags: {} as DeployFlags,
    })

    expect(enabled).toBe(true)
    expect(reporter.results).toHaveLength(2)
    expect(reporter.results.every((c) => c.status === 'warn')).toBe(true)
    expect(reporter.results[0]?.message).toContain('autoUpdates config has moved')
    expect(reporter.results[1]?.message).toContain('Please update sanity.cli.ts')
    expect(reporter.results[1]?.message).toContain('deployment: {autoUpdates: true}')
  })

  test('a deprecated flag warns', () => {
    const reporter = createCollectingReporter()

    checkAutoUpdates(reporter, {cliConfig: {}, flags: {'auto-updates': true} as DeployFlags})

    expect(reporter.results).toEqual([expect.objectContaining({status: 'warn'})])
  })

  test('a clean config records no check', () => {
    const reporter = createCollectingReporter()

    checkAutoUpdates(reporter, {
      cliConfig: {deployment: {autoUpdates: true}},
      flags: {} as DeployFlags,
    })

    expect(reporter.results).toHaveLength(0)
  })
})
