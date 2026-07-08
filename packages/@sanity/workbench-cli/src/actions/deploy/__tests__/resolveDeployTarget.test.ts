import {exitCodes} from '@sanity/cli-core'
import {describeAppTarget, describeStudioTarget} from '@sanity/cli-core/deploy'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {type Application, getApplication} from '../deployWorkbenchApp.js'
import {resolveWorkbenchApp, resolveWorkbenchStudio} from '../resolveDeployTarget.js'

vi.mock('../deployWorkbenchApp.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getApplication: vi.fn(),
}))

const mockGetApplication = vi.mocked(getApplication)

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

beforeEach(() => vi.clearAllMocks())

describe('resolveWorkbenchApp', () => {
  test('existing appId → found, described as a pass check', async () => {
    mockGetApplication.mockResolvedValue(workbenchApp({title: 'Drop Desk'}))

    const resolution = await resolveWorkbenchApp({appId: 'app-1'})
    const {check} = describeAppTarget(resolution)

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Deploys to existing application "Drop Desk"')
  })

  test('unknown appId → invalid, described as a fail pointing to deployment.appId', async () => {
    mockGetApplication.mockResolvedValue(null)

    const resolution = await resolveWorkbenchApp({appId: 'nope'})
    const {check} = describeAppTarget(resolution)

    expect(check.status).toBe('fail')
    expect(check.solution).toContain('deployment.appId')
  })

  test('no appId → would-create, without hitting the API', async () => {
    const resolution = await resolveWorkbenchApp({appId: undefined})
    const {check} = describeAppTarget(resolution, {title: 'New App'})

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Would create a new application "New App"')
    expect(mockGetApplication).not.toHaveBeenCalled()
  })
})

describe('resolveWorkbenchStudio', () => {
  test('existing appId → found, with the studio URL in the target', async () => {
    mockGetApplication.mockResolvedValue(workbenchApp({slug: 'my-studio', type: 'studio'}))

    const resolution = await resolveWorkbenchStudio({appId: 'app-1', studioHost: undefined})
    const {check, target} = describeStudioTarget(resolution, {isExternal: false})

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Deploys to existing studio https://my-studio.sanity.studio')
    expect(target?.url).toBe('https://my-studio.sanity.studio')
  })

  test('no appId with a studioHost → would-create that hostname', async () => {
    const resolution = await resolveWorkbenchStudio({appId: undefined, studioHost: 'my-studio'})
    const {check} = describeStudioTarget(resolution, {isExternal: false, title: 'New Studio'})

    expect(check).toMatchObject({status: 'pass'})
    expect(check.message).toContain('Would create studio hostname')
    expect(check.message).toContain('titled "New Studio"')
    expect(mockGetApplication).not.toHaveBeenCalled()
  })

  test('no appId and no studioHost → needs-input, a usage-error fail', async () => {
    const resolution = await resolveWorkbenchStudio({appId: undefined, studioHost: undefined})
    const {check} = describeStudioTarget(resolution, {isExternal: false})

    expect(check).toMatchObject({exitCode: exitCodes.USAGE_ERROR, status: 'fail'})
    expect(check.solution).toContain('studioHost')
  })
})
