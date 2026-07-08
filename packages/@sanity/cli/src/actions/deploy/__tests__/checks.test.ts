import {type CliConfig, exitCodes, type Output} from '@sanity/cli-core'
import {type Application, getApplication} from '@sanity/workbench-cli/deploy'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
  type UserApplication,
  type UserApplicationResolved,
} from '../../../services/userApplications.js'
import {
  checkAppIdConfig,
  checkAppTarget,
  checkAutoUpdates,
  checkStudioTarget,
  enforce,
} from '../checks.js'
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

describe('enforce', () => {
  test('a fail exits with its exit code', () => {
    const output = mockOutput()
    enforce(output, {exitCode: 2, message: 'boom', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom', {exit: 2})
  })

  test('a fail without an exit code defaults to 1', () => {
    const output = mockOutput()
    enforce(output, {message: 'boom', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom', {exit: 1})
  })

  test('a warn prints and does not exit', () => {
    const output = mockOutput()
    enforce(output, {message: 'heads up', status: 'warn'})
    expect(output.warn).toHaveBeenCalledWith('heads up')
    expect(output.error).not.toHaveBeenCalled()
  })

  test('pass and skip are silent', () => {
    const output = mockOutput()
    enforce(output, {message: 'good', status: 'pass'})
    enforce(output, {message: 'skipped', status: 'skip'})
    expect(output.error).not.toHaveBeenCalled()
    expect(output.warn).not.toHaveBeenCalled()
  })

  test('a fail appends its solution to the message', () => {
    const output = mockOutput()
    enforce(output, {message: 'boom', solution: 'do X', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom: do X', {exit: 1})
  })

  test('a warn appends its solution to the message', () => {
    const output = mockOutput()
    enforce(output, {message: 'heads up', solution: 'do Y', status: 'warn'})
    expect(output.warn).toHaveBeenCalledWith('heads up: do Y')
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

    const {check, target} = await checkStudioTarget(studioArgs)

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Deploys to existing studio https://my-studio.sanity.studio')
    // The URL the human report shows is the same one the JSON reporter reads
    expect(target).toEqual({
      applicationId: 'app-1',
      title: null,
      url: 'https://my-studio.sanity.studio',
    })
  })

  test('would-create → pass check', async () => {
    mockResolveStudio.mockResolvedValue({appHost: 'new-studio', type: 'would-create'})

    const {check, target} = await checkStudioTarget(studioArgs)

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Would create studio hostname')
    expect(target?.title).toBeNull()
  })

  test('would-create with a title → pass check names the title', async () => {
    mockResolveStudio.mockResolvedValue({appHost: 'new-studio', type: 'would-create'})

    const {check, target} = await checkStudioTarget({...studioArgs, title: 'My Studio'})

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('titled "My Studio"')
    // The JSON target echoes the requested title, matching the human message
    expect(target).toEqual({
      applicationId: null,
      title: 'My Studio',
      url: 'https://new-studio.sanity.studio',
    })
  })

  test('would-create with an empty title → target.title null, like the message', async () => {
    mockResolveStudio.mockResolvedValue({appHost: 'new-studio', type: 'would-create'})

    const {check, target} = await checkStudioTarget({...studioArgs, title: ''})

    expect(check.message).not.toContain('titled')
    expect(target?.title).toBeNull()
  })

  test('external would-create → pass check', async () => {
    mockResolveStudio.mockResolvedValue({
      appHost: 'https://studio.example.com',
      type: 'would-create',
    })

    const {check} = await checkStudioTarget({...studioArgs, isExternal: true})

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Would register external studio at https://studio.example.com')
  })

  test('needs-input → fail check with a pure problem and its fix', async () => {
    mockResolveStudio.mockResolvedValue({existing: [], type: 'needs-input'})

    const {check} = await checkStudioTarget(studioArgs)

    expect(check).toEqual({
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

    const {check} = await checkStudioTarget({...studioArgs, appId: 'nope'})

    expect(check).toMatchObject({
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

    const {check} = await checkStudioTarget({...studioArgs, urlFlag: 'bad host'})

    expect(check).toMatchObject({exitCode: exitCodes.USAGE_ERROR, status: 'fail'})
  })

  test('blocked → skip check', async () => {
    mockResolveStudio.mockResolvedValue({message: 'api.projectId is missing', type: 'blocked'})

    const {check} = await checkStudioTarget(studioArgs)

    expect(check.status).toBe('skip')
  })

  test('a thrown resolution becomes a fail check', async () => {
    mockResolveStudio.mockRejectedValue(new Error('network down'))

    const {check} = await checkStudioTarget(studioArgs)

    expect(check.message).toContain('Failed to resolve deploy target: network down')
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

    const {check, target} = await checkAppTarget({appId: 'core-1', organizationId: 'org-1'})

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Deploys to existing application "My App"')
    expect(check.message).toContain('/@org-1/application/core-1')
    expect(target?.applicationId).toBe('core-1')
    expect(target?.url).toContain('/@org-1/application/core-1')
  })

  test('would-create without a title → fail check pointing to --title', async () => {
    mockResolveApp.mockResolvedValue({type: 'would-create'})

    const {check} = await checkAppTarget({appId: undefined, organizationId: 'org-1'})

    expect(check).toMatchObject({exitCode: exitCodes.USAGE_ERROR, status: 'fail'})
    expect(check.message).toContain('No application to deploy to')
    expect(check.solution).toContain('--title')
    expect(check.solution).toContain('app.title')
  })

  test('would-create with a title → pass check (creates without prompting)', async () => {
    mockResolveApp.mockResolvedValue({type: 'would-create'})

    const {check, target} = await checkAppTarget({
      appId: undefined,
      organizationId: 'org-1',
      title: 'My App',
    })

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Would create a new application "My App"')
    // The JSON target carries the pending title; id and URL come on creation
    expect(target).toEqual({applicationId: null, title: 'My App', url: null})
  })

  test('needs-input → fail check (would prompt)', async () => {
    mockResolveApp.mockResolvedValue({
      existing: [application(), application()] as UserApplicationResolved[],
      type: 'needs-input',
    })

    const {check} = await checkAppTarget({appId: undefined, organizationId: 'org-1'})

    expect(check).toMatchObject({exitCode: exitCodes.USAGE_ERROR, status: 'fail'})
    expect(check.message).toContain('2 existing applications to choose from')
  })

  test('invalid → fail check', async () => {
    mockResolveApp.mockResolvedValue({
      message: 'Cannot find app with app ID nope',
      reason: 'app-not-found',
      type: 'invalid',
    })

    const {check} = await checkAppTarget({appId: 'nope', organizationId: 'org-1'})

    expect(check.status).toBe('fail')
    expect(check.solution).toContain('deployment.appId')
  })

  test('a 403 becomes a permissions fail check', async () => {
    mockResolveApp.mockRejectedValue(Object.assign(new Error('forbidden'), {statusCode: 403}))

    const {check} = await checkAppTarget({appId: undefined, organizationId: 'org-1'})

    expect(check.status).toBe('fail')
    expect(check.message).toContain('don’t have permission')
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

    const {check} = await checkAppTarget({appId: 'app-1', isWorkbenchApp: true, title: 'ignored'})

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Deploys to existing application "Drop Desk"')
  })

  test('unknown appId → fail check pointing to deployment.appId', async () => {
    mockGetApplication.mockResolvedValue(null)

    const {check} = await checkAppTarget({appId: 'nope', isWorkbenchApp: true, title: 'ignored'})

    expect(check.status).toBe('fail')
    expect(check.solution).toContain('deployment.appId')
  })

  test('no appId → pass check for the application that would be created', async () => {
    const {check} = await checkAppTarget({
      appId: undefined,
      isWorkbenchApp: true,
      title: 'New App',
    })

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Would create a new application "New App"')
    expect(mockGetApplication).not.toHaveBeenCalled()
  })
})

describe('checkStudioTarget (workbench backend)', () => {
  test('existing appId → pass check for the resolved studio, returns its target', async () => {
    mockGetApplication.mockResolvedValue(workbenchApp({slug: 'my-studio', type: 'studio'}))

    const {check, target} = await checkStudioTarget({
      appId: 'app-1',
      isWorkbenchApp: true,
      studioHost: undefined,
    })

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Deploys to existing studio https://my-studio.sanity.studio')
    expect(target?.url).toBe('https://my-studio.sanity.studio')
  })

  test('no appId with a studioHost → pass check for the studio that would be created', async () => {
    const {check} = await checkStudioTarget({
      appId: undefined,
      isWorkbenchApp: true,
      studioHost: 'my-studio',
      title: 'New Studio',
    })

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Would create studio hostname')
    expect(check.message).toContain('titled "New Studio"')
    expect(mockGetApplication).not.toHaveBeenCalled()
  })

  test('no appId and no studioHost → usage-error fail check', async () => {
    const {check} = await checkStudioTarget({
      appId: undefined,
      isWorkbenchApp: true,
      studioHost: undefined,
    })

    expect(check).toMatchObject({exitCode: exitCodes.USAGE_ERROR, status: 'fail'})
    expect(check.solution).toContain('studioHost')
  })
})

describe('checkAutoUpdates', () => {
  test('a config conflict is a fail check', () => {
    const {checks, enabled} = checkAutoUpdates({
      cliConfig: {autoUpdates: true, deployment: {autoUpdates: false}},
      flags: {} as DeployFlags,
    })

    expect(enabled).toBe(false)
    expect(checks).toEqual([expect.objectContaining({status: 'fail'})])
  })

  test('the deprecated top-level config warns and includes the migration edit', () => {
    const {checks, enabled} = checkAutoUpdates({
      cliConfig: {autoUpdates: true},
      flags: {} as DeployFlags,
    })

    expect(enabled).toBe(true)
    expect(checks).toHaveLength(2)
    expect(checks.every((check) => check.status === 'warn')).toBe(true)
    expect(checks[0]?.message).toContain('autoUpdates config has moved')
    expect(checks[1]?.message).toContain('Please update sanity.cli.ts')
    expect(checks[1]?.message).toContain('deployment: {autoUpdates: true}')
  })

  test('a deprecated flag warns', () => {
    const {checks} = checkAutoUpdates({
      cliConfig: {},
      flags: {'auto-updates': true} as DeployFlags,
    })

    expect(checks).toEqual([expect.objectContaining({status: 'warn'})])
  })

  test('a clean config records no check', () => {
    const {checks} = checkAutoUpdates({
      cliConfig: {deployment: {autoUpdates: true}},
      flags: {} as DeployFlags,
    })

    expect(checks).toHaveLength(0)
  })
})

describe('checkAppIdConfig', () => {
  test('both app.id and deployment.appId set is a fail check with a fix', () => {
    const check = checkAppIdConfig({app: {id: 'old'}, deployment: {appId: 'new'}} as CliConfig)

    expect(check).toEqual({
      message: 'Both `app.id` (deprecated) and `deployment.appId` are set',
      solution: 'Remove `app.id` from sanity.cli.ts',
      status: 'fail',
    })
  })

  test('the deprecated app.id alone warns', () => {
    const check = checkAppIdConfig({app: {id: 'old'}} as CliConfig)

    expect(check).toMatchObject({status: 'warn'})
    expect(check?.message).toContain('deprecated')
  })

  test('deployment.appId alone records no check', () => {
    expect(checkAppIdConfig({deployment: {appId: 'new'}} as CliConfig)).toBeNull()
  })
})
