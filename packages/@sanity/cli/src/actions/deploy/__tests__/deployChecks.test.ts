import {type CliConfig, exitCodes} from '@sanity/cli-core'
import {createCollectingReporter} from '@sanity/cli-core/checks'
import {type Application, getApplication} from '@sanity/workbench-cli/deploy'
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
  type DeployCheck,
} from '../deployChecks.js'
import {resolveAppDeployTarget, resolveStudioDeployTarget} from '../resolveDeployTarget.js'
import {type DeployFlags} from '../types.js'

// The user-applications resolvers are stubbed; the workbench resolvers stay real
// and exercise the mocked getApplication.
vi.mock('../resolveDeployTarget.js', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveAppDeployTarget: vi.fn(),
  resolveStudioDeployTarget: vi.fn(),
}))

vi.mock(import('@sanity/workbench-cli/deploy'), async (importOriginal) => ({
  ...(await importOriginal()),
  getApplication: vi.fn(),
}))

const mockResolveStudio = vi.mocked(resolveStudioDeployTarget)
const mockResolveApp = vi.mocked(resolveAppDeployTarget)
const mockGetApplication = vi.mocked(getApplication)

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
    const reporter = createCollectingReporter<DeployCheck>()

    await checkStudioTarget(reporter, studioArgs)

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain(
      'Deploys to existing studio https://my-studio.sanity.studio',
    )
    // The URL the human report shows is the same one the JSON reporter reads
    expect(reporter.results[0]?.target).toEqual({
      action: 'update',
      applicationId: 'app-1',
      title: null,
      url: 'https://my-studio.sanity.studio',
    })
  })

  test('would-create → pass check', async () => {
    mockResolveStudio.mockResolvedValue({appHost: 'new-studio', type: 'would-create'})
    const reporter = createCollectingReporter<DeployCheck>()

    await checkStudioTarget(reporter, studioArgs)

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Would create studio hostname')
    expect(reporter.results[0]?.target?.title).toBeNull()
  })

  test('would-create with a title → pass check names the title', async () => {
    mockResolveStudio.mockResolvedValue({appHost: 'new-studio', type: 'would-create'})
    const reporter = createCollectingReporter<DeployCheck>()

    await checkStudioTarget(reporter, {...studioArgs, title: 'My Studio'})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('titled "My Studio"')
    // The JSON target echoes the requested title, matching the human message
    expect(reporter.results[0]?.target).toEqual({
      action: 'create',
      applicationId: null,
      title: 'My Studio',
      url: 'https://new-studio.sanity.studio',
    })
  })

  test('would-create with an empty title → target.title null, like the message', async () => {
    mockResolveStudio.mockResolvedValue({appHost: 'new-studio', type: 'would-create'})
    const reporter = createCollectingReporter<DeployCheck>()

    await checkStudioTarget(reporter, {...studioArgs, title: ''})

    expect(reporter.results[0]?.message).not.toContain('titled')
    expect(reporter.results[0]?.target?.title).toBeNull()
  })

  test('external would-create → pass check', async () => {
    mockResolveStudio.mockResolvedValue({
      appHost: 'https://studio.example.com',
      type: 'would-create',
    })
    const reporter = createCollectingReporter<DeployCheck>()

    await checkStudioTarget(reporter, {...studioArgs, isExternal: true})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain(
      'Would register external studio at https://studio.example.com',
    )
  })

  test('needs-input → fail check with a pure problem and its fix', async () => {
    mockResolveStudio.mockResolvedValue({existing: [], type: 'needs-input'})
    const reporter = createCollectingReporter<DeployCheck>()

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
    const reporter = createCollectingReporter<DeployCheck>()

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
    const reporter = createCollectingReporter<DeployCheck>()

    await checkStudioTarget(reporter, {...studioArgs, urlFlag: 'bad host'})

    expect(reporter.results[0]).toMatchObject({
      exitCode: exitCodes.USAGE_ERROR,
      status: 'fail',
    })
  })

  test('blocked → skip check', async () => {
    mockResolveStudio.mockResolvedValue({message: 'api.projectId is missing', type: 'blocked'})
    const reporter = createCollectingReporter<DeployCheck>()

    await checkStudioTarget(reporter, studioArgs)

    expect(reporter.results[0]?.status).toBe('skip')
  })

  test('a thrown resolution becomes a fail check', async () => {
    mockResolveStudio.mockRejectedValue(new Error('network down'))
    const reporter = createCollectingReporter<DeployCheck>()

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
    const reporter = createCollectingReporter<DeployCheck>()

    await checkAppTarget(reporter, {appId: 'core-1', organizationId: 'org-1'})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Deploys to existing application "My App"')
    expect(reporter.results[0]?.message).toContain('/@org-1/application/core-1')
    expect(reporter.results[0]?.target?.action).toBe('update')
    expect(reporter.results[0]?.target?.applicationId).toBe('core-1')
    expect(reporter.results[0]?.target?.url).toContain('/@org-1/application/core-1')
  })

  test('would-create without a title → fail check pointing to --title', async () => {
    mockResolveApp.mockResolvedValue({type: 'would-create'})
    const reporter = createCollectingReporter<DeployCheck>()

    await checkAppTarget(reporter, {appId: undefined, organizationId: 'org-1'})

    expect(reporter.results[0]).toMatchObject({exitCode: exitCodes.USAGE_ERROR, status: 'fail'})
    expect(reporter.results[0]?.message).toContain('No application to deploy to')
    expect(reporter.results[0]?.solution).toContain('--title')
    expect(reporter.results[0]?.solution).toContain('app.title')
  })

  test('would-create with a title → pass check (creates without prompting)', async () => {
    mockResolveApp.mockResolvedValue({type: 'would-create'})
    const reporter = createCollectingReporter<DeployCheck>()

    await checkAppTarget(reporter, {appId: undefined, organizationId: 'org-1', title: 'My App'})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Would create a new application "My App"')
    // The JSON target carries the pending title; id and URL come on creation
    expect(reporter.results[0]?.target).toEqual({
      action: 'create',
      applicationId: null,
      title: 'My App',
      url: null,
    })
  })

  test('needs-input → fail check (would prompt)', async () => {
    mockResolveApp.mockResolvedValue({
      existing: [application(), application()] as UserApplicationResolved[],
      type: 'needs-input',
    })
    const reporter = createCollectingReporter<DeployCheck>()

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
    const reporter = createCollectingReporter<DeployCheck>()

    await checkAppTarget(reporter, {appId: 'nope', organizationId: 'org-1'})

    expect(reporter.results[0]?.status).toBe('fail')
    expect(reporter.results[0]?.solution).toContain('deployment.appId')
  })

  test('a 403 becomes a permissions fail check', async () => {
    mockResolveApp.mockRejectedValue(Object.assign(new Error('forbidden'), {statusCode: 403}))
    const reporter = createCollectingReporter<DeployCheck>()

    await checkAppTarget(reporter, {appId: undefined, organizationId: 'org-1'})

    expect(reporter.results[0]?.status).toBe('fail')
    expect(reporter.results[0]?.message).toContain('don’t have permission')
  })
})

function workbenchApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    organizationId: 'org-1',
    slug: 'app',
    title: 'My App',
    type: 'coreApp',
    ...overrides,
  }
}

describe('checkAppTarget (workbench backend)', () => {
  test('existing appId → pass check for the resolved application', async () => {
    mockGetApplication.mockResolvedValue(workbenchApp({title: 'Drop Desk'}))
    const reporter = createCollectingReporter<DeployCheck>()

    await checkAppTarget(reporter, {appId: 'app-1', isWorkbenchApp: true, title: 'ignored'})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Deploys to existing application "Drop Desk"')
    expect(reporter.results[0]?.target?.action).toBe('update')
  })

  test('unknown appId → fail check pointing to deployment.appId', async () => {
    mockGetApplication.mockResolvedValue(null)
    const reporter = createCollectingReporter<DeployCheck>()

    await checkAppTarget(reporter, {appId: 'nope', isWorkbenchApp: true, title: 'ignored'})

    expect(reporter.results[0]?.status).toBe('fail')
    expect(reporter.results[0]?.solution).toContain('deployment.appId')
  })

  test('no appId → pass check for the application that would be created', async () => {
    const reporter = createCollectingReporter<DeployCheck>()

    await checkAppTarget(reporter, {appId: undefined, isWorkbenchApp: true, title: 'New App'})

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Would create a new application "New App"')
    expect(mockGetApplication).not.toHaveBeenCalled()
  })

  test('no appId with a configured slug → check and target name the slug', async () => {
    const reporter = createCollectingReporter()

    await checkAppTarget(reporter, {
      appId: undefined,
      isWorkbenchApp: true,
      slug: 'drop-desk',
      title: 'New App',
    })

    expect(reporter.results[0]?.message).toContain(
      'Would create a new application "New App" with slug "drop-desk"',
    )
    expect(reporter.results[0]?.target).toEqual({
      action: 'create',
      applicationId: null,
      slug: 'drop-desk',
      title: 'New App',
      url: null,
    })
  })
})

describe('checkStudioTarget (workbench backend)', () => {
  test('existing appId → pass check for the resolved studio, returns its target', async () => {
    mockGetApplication.mockResolvedValue(workbenchApp({slug: 'my-studio', type: 'studio'}))
    const reporter = createCollectingReporter<DeployCheck>()

    const target = await checkStudioTarget(reporter, {
      appId: 'app-1',
      isWorkbenchApp: true,
      studioHost: undefined,
    })

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain(
      'Deploys to existing studio https://my-studio.sanity.studio',
    )
    expect(target?.action).toBe('update')
    expect(target?.url).toBe('https://my-studio.sanity.studio')
  })

  test('no appId with a studioHost → pass check for the studio that would be created', async () => {
    const reporter = createCollectingReporter<DeployCheck>()

    await checkStudioTarget(reporter, {
      appId: undefined,
      isWorkbenchApp: true,
      studioHost: 'my-studio',
      title: 'New Studio',
    })

    expect(reporter.results[0]).toMatchObject({status: 'pass'})
    expect(reporter.results[0]?.message).toContain('Would create studio hostname')
    expect(reporter.results[0]?.message).toContain('titled "New Studio"')
    expect(mockGetApplication).not.toHaveBeenCalled()
  })

  test('no appId and no studioHost → usage-error fail check', async () => {
    const reporter = createCollectingReporter<DeployCheck>()

    await checkStudioTarget(reporter, {
      appId: undefined,
      isWorkbenchApp: true,
      studioHost: undefined,
    })

    expect(reporter.results[0]).toMatchObject({exitCode: exitCodes.USAGE_ERROR, status: 'fail'})
    expect(reporter.results[0]?.solution).toContain('studioHost')
  })
})

describe('checkAutoUpdates', () => {
  test('a config conflict is a fail check', () => {
    const reporter = createCollectingReporter<DeployCheck>()

    const enabled = checkAutoUpdates(reporter, {
      cliConfig: {autoUpdates: true, deployment: {autoUpdates: false}},
      flags: {} as DeployFlags,
    })

    expect(enabled).toBe(false)
    expect(reporter.results).toEqual([expect.objectContaining({status: 'fail'})])
  })

  test('the deprecated top-level config warns and includes the migration edit', () => {
    const reporter = createCollectingReporter<DeployCheck>()

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
    const reporter = createCollectingReporter<DeployCheck>()

    checkAutoUpdates(reporter, {cliConfig: {}, flags: {'auto-updates': true} as DeployFlags})

    expect(reporter.results).toEqual([expect.objectContaining({status: 'warn'})])
  })

  test('a clean config records no check', () => {
    const reporter = createCollectingReporter<DeployCheck>()

    checkAutoUpdates(reporter, {
      cliConfig: {deployment: {autoUpdates: true}},
      flags: {} as DeployFlags,
    })

    expect(reporter.results).toHaveLength(0)
  })
})

describe('checkAppId', () => {
  test('both app.id and deployment.appId set is a fail check with a fix', () => {
    const reporter = createCollectingReporter<DeployCheck>()

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
    const reporter = createCollectingReporter<DeployCheck>()

    checkAppId(reporter, {cliConfig: {app: {id: 'old'}} as CliConfig})

    expect(reporter.results).toEqual([expect.objectContaining({status: 'warn'})])
    expect(reporter.results[0]?.message).toContain('deprecated')
  })

  test('deployment.appId alone records no check', () => {
    const reporter = createCollectingReporter<DeployCheck>()

    checkAppId(reporter, {cliConfig: {deployment: {appId: 'new'}} as CliConfig})

    expect(reporter.results).toHaveLength(0)
  })
})
