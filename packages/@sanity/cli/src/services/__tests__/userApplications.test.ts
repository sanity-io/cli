import {getGlobalCliClient} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  deleteUserApplication,
  getUserApplication,
  getUserApplications,
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

    const app = await getUserApplication({appId: '123', projectId: 'test-project'})

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

    const app = await getUserApplication({appHost: 'my-host', projectId: 'test-project'})

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

    const app = await getUserApplication({appId: '404', projectId: 'test-project'})

    expect(app).toBeNull()
  })

  test('rethrows on other errors', async () => {
    const error = new Error('oops')
    mockClient.request.mockRejectedValueOnce(error)

    await expect(getUserApplication({appId: '123', projectId: 'test-project'})).rejects.toThrow(
      'oops',
    )
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
