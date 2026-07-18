import {Readable} from 'node:stream'

import {getGlobalCliClient, type Output} from '@sanity/cli-core'
import FormData from 'form-data'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type BrettInterface, type BrettWorkspace} from '../../../services/applications.js'
import {deployCoreApp, deployStudio} from '../deployWorkbenchApp.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => ({
  ...(await importOriginal()),
  getGlobalCliClient: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', () => ({
  spinner: () => ({start: () => ({clear: vi.fn(), fail: vi.fn(), succeed: vi.fn()})}),
}))

vi.mock('tar-fs', () => ({pack: () => ({pipe: () => Readable.from(['tar'])})}))

const mockClient = {request: vi.fn()}
const output = {error: vi.fn(), log: vi.fn()} as unknown as Output
const interfaces: BrettInterface[] = [
  {metadata: null, moduleId: 'App', name: 'app', title: 'App', type: 'app', version: '1.0.0'},
]
const workspaces: BrettWorkspace[] = [
  {basePath: '/', dataset: 'production', name: 'default', projectId: 'proj-1', title: 'Default'},
]

/** The (name, value) pairs a call appended to its FormData. */
function appendedFields(): Array<[string, unknown]> {
  return appendSpy.mock.calls.map((call: unknown[]) => [call[0], call[1]] as [string, unknown])
}
let appendSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.mocked(getGlobalCliClient).mockResolvedValue(mockClient as never)
  appendSpy = vi.spyOn(FormData.prototype, 'append')
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const coreAppOptions = {
  interfaces,
  isAutoUpdating: false,
  isSingleton: false,
  organizationId: 'org-1',
  slug: 'abc123',
  sourceDir: '/tmp/build/app',
  title: 'Drop Desk',
  version: '1.0.0',
}

describe('deployCoreApp', () => {
  test('redeploys to an existing deployment.appId', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'})

    expect(await deployCoreApp({...coreAppOptions, appId: 'app_1'})).toEqual({
      applicationId: 'app_1',
    })
    expect(mockClient.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      uri: '/applications/app_1/deployments',
    })
  })

  test('creates a new application at the given slug when no appId is set', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_new'})

    expect(await deployCoreApp({...coreAppOptions, appId: undefined})).toEqual({
      applicationId: 'app_new',
    })
    expect(mockClient.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      uri: '/applications',
    })
    expect(appendedFields()).toContainEqual(['slug', 'abc123'])
  })

  test('forwards isSingleton when creating a singleton core app', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_new'})

    await deployCoreApp({...coreAppOptions, appId: undefined, isSingleton: true})

    expect(appendedFields()).toContainEqual(['isSingleton', 'true'])
  })

  test('sends the icon as a JSON part on create', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_new'})
    const icon = '<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg>'

    await deployCoreApp({...coreAppOptions, appId: undefined, icon})

    expect(appendedFields()).toContainEqual(['icon', JSON.stringify(icon)])
  })

  test('PATCHes the icon after redeploying to an existing appId', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)
    const icon = '<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg>'

    await deployCoreApp({...coreAppOptions, appId: 'app_1', icon})

    expect(mockClient.request.mock.calls[1][0]).toEqual({
      body: {icon},
      method: 'PATCH',
      uri: '/applications/app_1',
    })
  })

  test('skips the icon PATCH on redeploy when none is declared', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'})

    await deployCoreApp({...coreAppOptions, appId: 'app_1'})

    expect(mockClient.request).toHaveBeenCalledTimes(1)
  })
})

const studioOptions = {
  interfaces,
  isAutoUpdating: false,
  organizationId: 'org-1',
  output,
  projectId: 'proj-1',
  sourceDir: '/tmp/build/studio',
  title: 'My Studio',
  version: '3.0.0',
  workspaces,
}

describe('deployStudio', () => {
  test('redeploys to an existing deployment.appId', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'})

    expect(await deployStudio({...studioOptions, appId: 'app_1', studioHost: undefined})).toEqual({
      applicationId: 'app_1',
    })
    expect(mockClient.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      uri: '/applications/app_1/deployments',
    })
    expect(appendedFields()).toContainEqual(['workspaces', JSON.stringify(workspaces)])
  })

  test('creates a studio at studioHost when no appId is set', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'studio_new'})

    expect(
      await deployStudio({...studioOptions, appId: undefined, studioHost: 'my-studio'}),
    ).toEqual({applicationId: 'studio_new'})
    expect(mockClient.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      uri: '/applications',
    })
    expect(appendedFields()).toContainEqual(['slug', 'my-studio'])
    expect(appendedFields()).toContainEqual(['workspaces', JSON.stringify(workspaces)])
  })

  test('fails without deploying when no appId and no studioHost are set', async () => {
    await deployStudio({...studioOptions, appId: undefined, studioHost: undefined})

    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining('studio hostname'),
      expect.objectContaining({exit: expect.any(Number)}),
    )
    expect(mockClient.request).not.toHaveBeenCalled()
  })

  test('PATCHes the icon after redeploying to an existing appId', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)
    const icon = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>'

    await deployStudio({...studioOptions, appId: 'app_1', icon, studioHost: undefined})

    expect(mockClient.request.mock.calls[1][0]).toEqual({
      body: {icon},
      method: 'PATCH',
      uri: '/applications/app_1',
    })
  })
})
