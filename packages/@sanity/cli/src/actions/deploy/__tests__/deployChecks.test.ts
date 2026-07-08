import {type CliConfig, exitCodes, type Output} from '@sanity/cli-core'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
  type UserApplication,
  type UserApplicationResolved,
} from '../../../services/userApplications.js'
import {
  checkAppId,
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
  title: undefined,
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
    // The URL the human report shows is the same one the JSON reporter reads
    expect(reporter.results[0]?.target).toEqual({
      applicationId: 'app-1',
      title: null,
      url: 'https://my-studio.sanity.studio',
    })
  })

  test('would-create → pass check', async () => {
    mockResolveStudio.mockResolvedValue({appHost: 'new-studio', type: 'would-create'})
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, studioArgs)

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Would create studio hostname')
  })

  test('would-create with a title → pass check names the title', async () => {
    mockResolveStudio.mockResolvedValue({appHost: 'new-studio', type: 'would-create'})
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, {...studioArgs, title: 'My Studio'})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('titled "My Studio"')
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

  test('needs-input → fail check with a pure problem and its fix', async () => {
    mockResolveStudio.mockResolvedValue({existing: [], type: 'needs-input'})
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, studioArgs)

    expect(reporter.results[0]).toMatchObject({
      exitCode: exitCodes.USAGE_ERROR,
      message: 'No studio hostname configured',
      solution: 'Set `studioHost` in sanity.cli.ts, or pass a hostname with --url',
      status: 'fail',
    })
  })

  test('invalid app-not-found → fail check exits 1, like a real deploy', async () => {
    mockResolveStudio.mockResolvedValue({
      message: 'Cannot find app with app ID nope',
      reason: 'app-not-found',
      type: 'invalid',
    })
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, {...studioArgs, appId: 'nope'})

    expect(reporter.results[0]).toMatchObject({
      exitCode: 1,
      message: 'Cannot find app with app ID nope',
      status: 'fail',
    })
  })

  test('invalid host → fail check exits USAGE_ERROR, like a real deploy', async () => {
    mockResolveStudio.mockResolvedValue({
      message: 'Invalid studio hostname',
      reason: 'invalid-host',
      type: 'invalid',
    })
    const reporter = createCollectingReporter()

    await checkStudioTarget(reporter, {...studioArgs, urlFlag: 'bad host'})

    expect(reporter.results[0]).toMatchObject({
      exitCode: exitCodes.USAGE_ERROR,
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
    const app = application({
      appHost: 'app-host',
      id: 'core-1',
      organizationId: 'org-1',
      title: 'My App',
      type: 'coreApp',
    }) as UserApplicationResolved
    mockResolveApp.mockResolvedValue({application: app, type: 'found'})
    const reporter = createCollectingReporter()

    await checkAppTarget(reporter, {appId: 'core-1', organizationId: 'org-1'})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Deploys to existing application "My App"')
    expect(reporter.results[0]?.message).toContain('/@org-1/application/core-1')
    expect(reporter.results[0]?.target?.applicationId).toBe('core-1')
    expect(reporter.results[0]?.target?.url).toContain('/@org-1/application/core-1')
  })

  test('would-create without a title → fail check pointing to --title', async () => {
    mockResolveApp.mockResolvedValue({type: 'would-create'})
    const reporter = createCollectingReporter()

    await checkAppTarget(reporter, {appId: undefined, organizationId: 'org-1'})

    expect(reporter.results[0]).toMatchObject({exitCode: exitCodes.USAGE_ERROR, status: 'fail'})
    expect(reporter.results[0]?.message).toContain('No application to deploy to')
    expect(reporter.results[0]?.solution).toContain('--title')
    expect(reporter.results[0]?.solution).toContain('app.title')
  })

  test('would-create with a title → pass check (creates without prompting)', async () => {
    mockResolveApp.mockResolvedValue({type: 'would-create'})
    const reporter = createCollectingReporter()

    await checkAppTarget(reporter, {appId: undefined, organizationId: 'org-1', title: 'My App'})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Would create a new application "My App"')
    // The JSON target carries the pending title; id and URL come on creation
    expect(reporter.results[0]?.target).toEqual({applicationId: null, title: 'My App', url: null})
  })

  test('needs-input → fail check (would prompt)', async () => {
    mockResolveApp.mockResolvedValue({
      existing: [application(), application()] as UserApplicationResolved[],
      type: 'needs-input',
    })
    const reporter = createCollectingReporter()

    await checkAppTarget(reporter, {appId: undefined, organizationId: 'org-1'})

    expect(reporter.results[0]).toMatchObject({exitCode: exitCodes.USAGE_ERROR, status: 'fail'})
    expect(reporter.results[0]?.message).toContain('2 existing applications to choose from')
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

describe('checkAppId', () => {
  test('both app.id and deployment.appId set is a fail check with a fix', () => {
    const reporter = createCollectingReporter()

    checkAppId(reporter, {cliConfig: {app: {id: 'old'}, deployment: {appId: 'new'}} as CliConfig})

    expect(reporter.results).toEqual([
      {
        message: 'Both `app.id` (deprecated) and `deployment.appId` are set',
        solution: 'Remove `app.id` from sanity.cli.ts',
        status: 'fail',
      },
    ])
  })

  test('the deprecated app.id alone warns', () => {
    const reporter = createCollectingReporter()

    checkAppId(reporter, {cliConfig: {app: {id: 'old'}} as CliConfig})

    expect(reporter.results).toEqual([expect.objectContaining({status: 'warn'})])
    expect(reporter.results[0]?.message).toContain('deprecated')
  })

  test('deployment.appId alone records no check', () => {
    const reporter = createCollectingReporter()

    checkAppId(reporter, {cliConfig: {deployment: {appId: 'new'}} as CliConfig})

    expect(reporter.results).toHaveLength(0)
  })
})
