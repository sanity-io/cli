import {Readable} from 'node:stream'

import {getGlobalCliClient} from '@sanity/cli-core'
import FormData from 'form-data'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type BrettInterface, type BrettWorkspace} from '../../../services/applications.js'
import {createCoreApp, createStudio, deployWorkbenchApp} from '../deployWorkbenchApp.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => ({
  ...(await importOriginal()),
  getGlobalCliClient: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', () => ({
  spinner: () => ({start: () => ({clear: vi.fn(), fail: vi.fn(), succeed: vi.fn()})}),
}))

vi.mock('tar-fs', () => ({pack: () => ({pipe: () => Readable.from(['tar'])})}))

const mockClient = {request: vi.fn()}
const interfaces: BrettInterface[] = [
  {metadata: null, moduleId: 'App', name: 'app', title: 'App', type: 'app', version: '1.0.0'},
]
const workspaces: BrettWorkspace[] = [
  {basePath: '/', dataset: 'production', name: 'default', projectId: 'proj-1', title: 'Default'},
]
const icon = '<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg>'

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

describe('createCoreApp', () => {
  test('creates a coreApp at the given slug and returns the id', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_new'})

    expect(
      await createCoreApp({organizationId: 'org-1', slug: 'abc123', title: 'Drop Desk'}),
    ).toEqual({applicationId: 'app_new'})
    expect(mockClient.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      uri: '/applications',
    })
    const fields = appendedFields()
    expect(fields).toContainEqual(['type', 'coreApp'])
    expect(fields).toContainEqual(['slug', 'abc123'])
    // Create carries no deployment.
    expect(fields.map(([name]) => name)).not.toContain('tarball')
  })

  test('forwards isSingleton when creating a singleton core app', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_new'})

    await createCoreApp({isSingleton: true, organizationId: 'org-1', slug: 'ml', title: 'Media'})

    expect(appendedFields()).toContainEqual(['isSingleton', 'true'])
  })

  test('forwards visibility as a create-time part', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_new'})

    await createCoreApp({
      organizationId: 'org-1',
      slug: 'abc123',
      title: 'Drop Desk',
      visibility: 'unlisted',
    })

    expect(appendedFields()).toContainEqual(['visibility', 'unlisted'])
  })
})

describe('createStudio', () => {
  test('creates a studio at the given slug and returns the id', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'studio_new'})

    expect(
      await createStudio({
        organizationId: 'org-1',
        projectId: 'proj-1',
        slug: 'my-studio',
        title: 'My Studio',
      }),
    ).toEqual({applicationId: 'studio_new'})
    expect(mockClient.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      uri: '/applications',
    })
    const fields = appendedFields()
    expect(fields).toContainEqual(['type', 'studio'])
    expect(fields).toContainEqual(['slug', 'my-studio'])
    expect(fields).toContainEqual(['config', JSON.stringify({studio: {projectId: 'proj-1'}})])
  })
})

describe('deployWorkbenchApp', () => {
  test('POSTs a deployment (interfaces + tarball) to the application', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      applicationId: 'app_1',
      interfaces,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/app',
      title: 'Drop Desk',
      version: '1.0.0',
    })

    expect(mockClient.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      uri: '/applications/app_1/deployments',
    })
    const fields = appendedFields()
    expect(fields).toContainEqual(['version', '1.0.0'])
    expect(fields).toContainEqual(['interfaces', JSON.stringify(interfaces)])
    expect(fields.map(([name]) => name)).toContain('tarball')
  })

  test('sends workspaces for a studio deployment', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      applicationId: 'studio_1',
      interfaces,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/studio',
      title: 'My Studio',
      version: '3.0.0',
      workspaces,
    })

    expect(appendedFields()).toContainEqual(['workspaces', JSON.stringify(workspaces)])
  })

  test('syncs the title and icon after shipping the deployment', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      applicationId: 'app_1',
      icon,
      interfaces,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/app',
      title: 'Drop Desk',
      version: '1.0.0',
    })

    expect(mockClient.request.mock.calls[1][0]).toEqual({
      body: {icon, title: 'Drop Desk'},
      method: 'PATCH',
      uri: '/applications/app_1',
    })
  })

  test('syncs the title without an icon when none is declared', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      applicationId: 'app_1',
      interfaces,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/app',
      title: 'Drop Desk',
      version: '1.0.0',
    })

    expect(mockClient.request.mock.calls[1][0]).toEqual({
      body: {title: 'Drop Desk'},
      method: 'PATCH',
      uri: '/applications/app_1',
    })
  })

  test('syncs visibility on redeploy when declared', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployCoreApp({...coreAppOptions, appId: 'app_1', visibility: 'unlisted'})

    expect(mockClient.request.mock.calls[1][0]).toEqual({
      body: {title: 'Drop Desk', visibility: 'unlisted'},
      method: 'PATCH',
      uri: '/applications/app_1',
    })
  })
})
