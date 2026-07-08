import {type CliConfig, exitCodes} from '@sanity/cli-core'
import {type DeployFlags} from '@sanity/cli-core/deploy'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
  type UserApplication,
  type UserApplicationResolved,
} from '../../../services/userApplications.js'
import {checkAppIdConfig, checkAppTarget, checkAutoUpdates, checkStudioTarget} from '../checks.js'
import {resolveAppDeployTarget, resolveStudioDeployTarget} from '../resolveDeployTarget.js'

vi.mock('../resolveDeployTarget.js', async (importOriginal) => ({
  ...(await importOriginal()),
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
