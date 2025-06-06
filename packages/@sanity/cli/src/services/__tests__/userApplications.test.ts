import {afterEach, describe, expect, test, vi} from 'vitest'

import {deleteUserApplication, getUserApplication} from '../userApplications.js'

const mockClient = {
  request: vi.fn(),
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('getUserApplication', () => {
  test('queries by application id', async () => {
    const result = {id: '123', appHost: 'my-host'}
    mockClient.request.mockResolvedValueOnce(result)

    const app = await getUserApplication({client: mockClient as any, appId: '123'})

    expect(mockClient.request).toHaveBeenCalledWith({
      uri: '/user-applications/123',
      query: {appType: 'coreApp'},
    })
    expect(app).toBe(result)
  })

  test('queries by host when no id is given', async () => {
    const result = {id: '123', appHost: 'my-host'}
    mockClient.request.mockResolvedValueOnce(result)

    const app = await getUserApplication({client: mockClient as any, appHost: 'my-host'})

    expect(mockClient.request).toHaveBeenCalledWith({
      uri: '/user-applications',
      query: {appHost: 'my-host'},
    })
    expect(app).toBe(result)
  })

  test('queries default when neither id nor host is given', async () => {
    const result = {id: '123', appHost: 'my-host'}
    mockClient.request.mockResolvedValueOnce(result)

    const app = await getUserApplication({client: mockClient as any})

    expect(mockClient.request).toHaveBeenCalledWith({
      uri: '/user-applications',
      query: {default: 'true'},
    })
    expect(app).toBe(result)
  })

  test('returns null on 404 error', async () => {
    const error = new Error('not found') as any
    error.statusCode = 404
    mockClient.request.mockRejectedValueOnce(error)

    const app = await getUserApplication({client: mockClient as any, appId: '404'})

    expect(app).toBeNull()
  })

  test('rethrows on other errors', async () => {
    const error = new Error('oops')
    mockClient.request.mockRejectedValueOnce(error)

    await expect(
      getUserApplication({client: mockClient as any, appId: '123'})
    ).rejects.toThrow('oops')
  })
})

describe('deleteUserApplication', () => {
  test('sends delete request', async () => {
    mockClient.request.mockResolvedValueOnce(undefined)

    await deleteUserApplication({
      client: mockClient as any,
      applicationId: '123',
      appType: 'coreApp',
    })

    expect(mockClient.request).toHaveBeenCalledWith({
      uri: '/user-applications/123',
      method: 'DELETE',
      query: {appType: 'coreApp'},
    })
  })
})
