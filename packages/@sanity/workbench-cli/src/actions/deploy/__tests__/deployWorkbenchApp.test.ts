import {Readable} from 'node:stream'

import {getGlobalCliClient} from '@sanity/cli-core'
import {createMockOutput} from '@sanity/cli-test/test/util'
import FormData from 'form-data'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type BrettInterface, type BrettWorkspace} from '../../../services/applications.js'
import {deployCoreApp, deployStudio} from '../deployWorkbenchApp.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => ({
  ...(await importOriginal()),
  getGlobalCliClient: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))

vi.mock('tar-fs', () => ({pack: () => ({pipe: () => Readable.from(['tar'])})}))

const mockClient = {request: vi.fn()}
const output = createMockOutput()
const interfaces: BrettInterface[] = [
  {moduleId: 'App', name: 'app', title: 'App', type: 'app', version: '1.0.0'},
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
})
