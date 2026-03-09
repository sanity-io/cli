import {getGlobalCliClient} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {getUserGrants, GRANTS_API_VERSION} from '../grants.js'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: mockRequest,
    }),
  }
})

const mockGetGlobalCliClient = vi.mocked(getGlobalCliClient)

afterEach(() => {
  vi.clearAllMocks()
})

describe('getUserGrants', () => {
  test('calls getGlobalCliClient with correct options', async () => {
    mockRequest.mockResolvedValue({organizations: {}, projects: {}})

    await getUserGrants()

    expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
      apiVersion: GRANTS_API_VERSION,
      requireUser: true,
    })
  })

  test('requests /users/me/grants endpoint', async () => {
    const mockGrants = {
      organizations: {},
      projects: {
        'project-a': {
          'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
        },
      },
    }
    mockRequest.mockResolvedValue(mockGrants)

    const result = await getUserGrants()

    expect(mockRequest).toHaveBeenCalledWith({uri: '/users/me/grants'})
    expect(result).toBe(mockGrants)
  })

  test('propagates errors from the API', async () => {
    mockRequest.mockRejectedValue(new Error('Unauthorized'))

    await expect(getUserGrants()).rejects.toThrow('Unauthorized')
  })
})
