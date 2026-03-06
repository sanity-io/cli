import {getGlobalCliClient} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  createDeployment,
  createUserApplication,
  deleteUserApplication,
  getUserApplication,
} from '../userApplications.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getGlobalCliClient: vi.fn(),
  }
})

const mockClient = {
  request: vi.fn(),
}

beforeEach(() => {
  vi.mocked(getGlobalCliClient).mockResolvedValue(mockClient as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('getUserApplication', () => {
  test('queries by application id for studio app', async () => {
    const result = {appHost: 'my-host', id: '123'}
    mockClient.request.mockResolvedValueOnce(result)

    const app = await getUserApplication({appId: '123', isSdkApp: false, projectId: 'test-project'})

    expect(mockClient.request).toHaveBeenCalledWith({
      uri: '/projects/test-project/user-applications/123',
    })
    expect(app).toBe(result)
  })

  test('queries by application id for SDK app', async () => {
    const result = {appHost: 'my-host', id: '123'}
    mockClient.request.mockResolvedValueOnce(result)

    const app = await getUserApplication({appId: '123', isSdkApp: true})

    expect(mockClient.request).toHaveBeenCalledWith({
      query: {appType: 'coreApp'},
      uri: '/user-applications/123',
    })
    expect(app).toBe(result)
  })

  test('queries by host when no id is given for studio app', async () => {
    const result = {appHost: 'my-host', id: '123'}
    mockClient.request.mockResolvedValueOnce(result)

    const app = await getUserApplication({
      appHost: 'my-host',
      isSdkApp: false,
      projectId: 'test-project',
    })

    expect(mockClient.request).toHaveBeenCalledWith({
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test-project/user-applications',
    })
    expect(app).toBe(result)
  })

  test('returns null on 404 error', async () => {
    const error = new Error('not found') as Error & {statusCode: number}
    error.statusCode = 404
    mockClient.request.mockRejectedValueOnce(error)

    const app = await getUserApplication({appId: '404', isSdkApp: false, projectId: 'test-project'})

    expect(app).toBeNull()
  })

  test('rethrows on other errors', async () => {
    const error = new Error('oops')
    mockClient.request.mockRejectedValueOnce(error)

    await expect(
      getUserApplication({appId: '123', isSdkApp: false, projectId: 'test-project'}),
    ).rejects.toThrow('oops')
  })
})

describe('deleteUserApplication', () => {
  test('sends delete request', async () => {
    vi.mocked(mockClient.request).mockResolvedValueOnce(undefined)

    await deleteUserApplication({
      applicationId: '123',
      appType: 'coreApp',
    })

    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'DELETE',
      query: {appType: 'coreApp'},
      uri: '/user-applications/123',
    })
  })
})

describe('createUserApplication', () => {
  test('sends POST with urlType for external studio', async () => {
    const result = {appHost: 'https://studio.example.com', id: 'new-id', urlType: 'external'}
    mockClient.request.mockResolvedValueOnce(result)

    const app = await createUserApplication({
      appType: 'studio',
      body: {
        appHost: 'https://studio.example.com',
        type: 'studio',
        urlType: 'external',
      },
      projectId: 'test-project',
    })

    expect(mockClient.request).toHaveBeenCalledWith({
      body: {
        appHost: 'https://studio.example.com',
        type: 'studio',
        urlType: 'external',
      },
      method: 'POST',
      query: {appType: 'studio'},
      uri: '/projects/test-project/user-applications',
    })
    expect(app).toBe(result)
  })
})

describe('createDeployment', () => {
  test('sends manifest without tarball for external deploy', async () => {
    const manifest = {
      buildId: '"123"',
      bundleVersion: '3.0.0',
      createdAt: '2024-01-01T00:00:00.000Z',
      workspaces: [
        {
          basePath: '/',
          dataset: 'prod',
          name: 'default',
          projectId: 'proj-123',
          schemaDescriptorId: 'desc-1',
          title: 'Test',
        },
      ],
    }

    mockClient.request.mockResolvedValueOnce({location: 'https://studio.example.com'})

    const result = await createDeployment({
      applicationId: 'app-123',
      isApp: false,
      isAutoUpdating: false,
      manifest,
      projectId: 'proj-123',
      version: '3.0.0',
    })

    expect(result).toEqual({location: 'https://studio.example.com'})
    expect(mockClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        query: {appType: 'studio'},
        uri: '/projects/proj-123/user-applications/app-123/deployments',
      }),
    )
  })

  test('sends manifest and tarball for internal deploy', async () => {
    const {createGzip} = await import('node:zlib')
    const {PassThrough} = await import('node:stream')

    const manifest = {
      buildId: '"123"',
      bundleVersion: '3.0.0',
      createdAt: '2024-01-01T00:00:00.000Z',
      workspaces: [
        {
          basePath: '/',
          dataset: 'prod',
          name: 'default',
          projectId: 'proj-123',
          schemaDescriptorId: 'desc-1',
          title: 'Test',
        },
      ],
    }

    const tarball = new PassThrough().pipe(createGzip())

    mockClient.request.mockResolvedValueOnce({location: 'https://test.sanity.studio'})

    const result = await createDeployment({
      applicationId: 'app-123',
      isApp: false,
      isAutoUpdating: true,
      manifest,
      projectId: 'proj-123',
      tarball,
      version: '3.0.0',
    })

    expect(result).toEqual({location: 'https://test.sanity.studio'})

    // Verify the request was made with headers from FormData (multipart)
    expect(mockClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': expect.stringContaining('multipart/form-data'),
        }),
        method: 'POST',
      }),
    )
  })
})
