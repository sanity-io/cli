import {Readable} from 'node:stream'
import {type Gzip} from 'node:zlib'

import * as apiClient from '@sanity/cli-test/mocks/cli-core/apiClient'
import FormData from 'form-data'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  type BrettInterface,
  type BrettWorkspace,
  createApplication,
  createDeployment,
  getApplication,
  getApplicationUrl,
  getWorkbenchUrl,
} from '../applications.js'

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  ...(await import('@sanity/cli-test/mocks/cli-core/apiClient')),
}))

const mockClient = {request: vi.fn()}
// A gzip stream is opaque to the service; a readable stands in for the tarball.
const tarball = () => Readable.from(['remote']) as unknown as Gzip
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
  apiClient.getGlobalCliClient.mockResolvedValue(mockClient as never)
  appendSpy = vi.spyOn(FormData.prototype, 'append')
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('getApplication', () => {
  test('resolves the application at vX with a user session', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_1', title: 'App', type: 'coreApp'})

    expect(await getApplication('app_1')).toMatchObject({id: 'app_1'})
    expect(apiClient.getGlobalCliClient).toHaveBeenCalledWith({apiVersion: 'vX', requireUser: true})
    expect(mockClient.request).toHaveBeenCalledWith({uri: '/applications/app_1'})
  })

  test('returns null when the application does not exist (404)', async () => {
    mockClient.request.mockRejectedValueOnce({statusCode: 404})
    expect(await getApplication('missing')).toBeNull()
  })

  test('rethrows any non-404 error', async () => {
    mockClient.request.mockRejectedValueOnce({statusCode: 500})
    await expect(getApplication('app_1')).rejects.toMatchObject({statusCode: 500})
  })
})

describe('createApplication', () => {
  test('POSTs a coreApp create with the deployment parts, no studio config', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_1'})

    await createApplication({
      interfaces,
      organizationId: 'org-1',
      slug: 'abc123',
      tarball: tarball(),
      title: 'Drop Desk',
      type: 'coreApp',
      version: '1.2.3',
    })

    const post = mockClient.request.mock.calls[0][0]
    expect(post).toMatchObject({method: 'POST', uri: '/applications'})
    expect(post.headers['content-type']).toMatch(/multipart\/form-data/)

    const fields = appendedFields()
    expect(fields).toContainEqual(['type', 'coreApp'])
    expect(fields).toContainEqual(['title', 'Drop Desk'])
    expect(fields).toContainEqual(['organizationId', 'org-1'])
    expect(fields).toContainEqual(['slug', 'abc123'])
    expect(fields).toContainEqual(['version', '1.2.3'])
    expect(fields).toContainEqual(['interfaces', JSON.stringify(interfaces)])
    expect(fields.map(([name]) => name)).toContain('tarball')
    expect(fields.map(([name]) => name)).not.toContain('config')
    expect(fields.map(([name]) => name)).not.toContain('workspaces')
    // isSingleton is opt-in; a regular create omits it.
    expect(fields.map(([name]) => name)).not.toContain('isSingleton')
  })

  test('flags a singleton create when isSingleton is set', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_1'})

    await createApplication({
      interfaces,
      isSingleton: true,
      organizationId: 'org-1',
      slug: 'dashboard',
      tarball: tarball(),
      title: 'Dashboard',
      type: 'coreApp',
      version: '1.0.0',
    })

    expect(appendedFields()).toContainEqual(['isSingleton', 'true'])
  })

  test('sends studio config and workspaces as JSON parts for a studio create', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_1'})

    await createApplication({
      interfaces,
      organizationId: 'org-1',
      projectId: 'proj-1',
      slug: 'my-studio',
      tarball: tarball(),
      title: 'My Studio',
      type: 'studio',
      version: '3.0.0',
      workspaces,
    })

    const fields = appendedFields()
    expect(fields).toContainEqual(['type', 'studio'])
    expect(fields).toContainEqual(['config', JSON.stringify({studio: {projectId: 'proj-1'}})])
    expect(fields).toContainEqual(['workspaces', JSON.stringify(workspaces)])
  })
})

describe('createDeployment', () => {
  test('POSTs a redeploy to the application, no config part', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'})

    await createDeployment({
      applicationId: 'app_1',
      interfaces,
      isAutoUpdating: true,
      tarball: tarball(),
      version: '1.2.4',
    })

    const post = mockClient.request.mock.calls[0][0]
    expect(post).toMatchObject({method: 'POST', uri: '/applications/app_1/deployments'})

    const fields = appendedFields()
    expect(fields).toContainEqual(['version', '1.2.4'])
    expect(fields).toContainEqual(['isAutoUpdating', 'true'])
    expect(fields).toContainEqual(['interfaces', JSON.stringify(interfaces)])
    expect(fields.map(([name]) => name)).not.toContain('config')
    expect(fields.map(([name]) => name)).not.toContain('workspaces')
  })

  test('includes workspaces as a JSON part when provided', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'})

    await createDeployment({
      applicationId: 'app_1',
      interfaces,
      isAutoUpdating: false,
      tarball: tarball(),
      version: '3.0.1',
      workspaces,
    })

    expect(appendedFields()).toContainEqual(['workspaces', JSON.stringify(workspaces)])
  })
})

describe('getWorkbenchUrl / getApplicationUrl', () => {
  afterEach(() => vi.unstubAllEnvs())

  test('builds production URLs on sanity.run', () => {
    expect(getWorkbenchUrl('org-1')).toBe('https://org-1.sanity.run')
    expect(getApplicationUrl({id: 'app-1', organizationId: 'org-1', type: 'coreApp'})).toBe(
      'https://org-1.sanity.run/application/app-1',
    )
    expect(getApplicationUrl({id: 'app-1', organizationId: 'org-1', type: 'studio'})).toBe(
      'https://org-1.sanity.run/studio/app-1',
    )
  })

  test('builds staging URLs on run.sanity.work', () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')
    expect(getWorkbenchUrl('org-1')).toBe('https://org-1.run.sanity.work')
    expect(getApplicationUrl({id: 'app-1', organizationId: 'org-1', type: 'coreApp'})).toBe(
      'https://org-1.run.sanity.work/application/app-1',
    )
  })
})
