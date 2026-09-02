import {getGlobalCliClient} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../actions/tokens/constants.js'
import {type Membership, type Robot} from '../../actions/tokens/types.js'
import {
  createToken,
  deleteToken,
  getProjectMembership,
  getTokenRoles,
  getTokens,
  rotateToken,
} from '../tokens.js'

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

const testProjectId = 'test-project'

const projectMembership: Membership = {
  resourceId: testProjectId,
  resourceType: 'project',
  roleNames: ['editor', 'viewer'],
}

const testRobot: Robot = {
  createdAt: '2023-01-01T00:00:00Z',
  id: 'robot-1',
  label: 'Test Robot',
  memberships: [projectMembership],
  tokenId: 'robot-1-active-token',
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('createToken', () => {
  test('posts the robot membership body and returns the robot with its token', async () => {
    const robotWithToken = {
      ...testRobot,
      memberships: [{...projectMembership, roleNames: ['editor']}],
      token: 'sk_secret',
    }
    mockRequest.mockResolvedValue(robotWithToken)

    const result = await createToken({
      label: 'Test Robot',
      projectId: testProjectId,
      roleName: 'editor',
    })

    expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
      apiVersion: TOKENS_API_VERSION,
      requireUser: true,
    })
    expect(mockRequest).toHaveBeenCalledWith({
      body: {
        label: 'Test Robot',
        memberships: [{resourceId: testProjectId, resourceType: 'project', roleNames: ['editor']}],
      },
      method: 'POST',
      query: {},
      url: `/access/project/${testProjectId}/robots`,
    })
    expect(result).toEqual(robotWithToken)
  })

  test('includes expiresAt in the body when provided', async () => {
    mockRequest.mockResolvedValue({...testRobot, token: 'sk_secret'})

    await createToken({
      expiresAt: '2030-01-01T00:00:00.000Z',
      label: 'Test Robot',
      projectId: testProjectId,
      roleName: 'editor',
    })

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          expiresAt: '2030-01-01T00:00:00.000Z',
          label: 'Test Robot',
          memberships: [
            {resourceId: testProjectId, resourceType: 'project', roleNames: ['editor']},
          ],
        },
      }),
    )
  })

  test('passes sendNotification=false as a query parameter', async () => {
    mockRequest.mockResolvedValue({...testRobot, token: 'sk_secret'})

    await createToken({
      label: 'Test Robot',
      projectId: testProjectId,
      roleName: 'editor',
      sendNotification: false,
    })

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({query: {sendNotification: 'false'}}),
    )
  })

  test('propagates errors from the API', async () => {
    mockRequest.mockRejectedValue(new Error('Forbidden'))

    await expect(
      createToken({
        label: 'Test Robot',
        projectId: testProjectId,
        roleName: 'editor',
      }),
    ).rejects.toThrow('Forbidden')
  })
})

describe('deleteToken', () => {
  test('deletes the robot by id', async () => {
    mockRequest.mockResolvedValue(undefined)

    await deleteToken({projectId: testProjectId, tokenId: 'robot-1'})

    expect(mockRequest).toHaveBeenCalledWith({
      method: 'DELETE',
      url: `/access/project/${testProjectId}/robots/robot-1`,
    })
  })

  test('propagates errors from the API', async () => {
    mockRequest.mockRejectedValue(new Error('Not found'))

    await expect(deleteToken({projectId: testProjectId, tokenId: 'missing'})).rejects.toThrow(
      'Not found',
    )
  })
})

describe('rotateToken', () => {
  test('authenticates with the provided token and posts to the rotate endpoint', async () => {
    const rotatedRobot = {...testRobot, token: 'sk_new_secret'}
    mockRequest.mockResolvedValue(rotatedRobot)

    const result = await rotateToken('sk_old_secret')

    expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
      apiVersion: TOKENS_API_VERSION,
      requireUser: true,
      token: 'sk_old_secret',
    })
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'POST',
      url: '/access/robots/me/rotate',
    })
    expect(result).toEqual(rotatedRobot)
  })

  test('propagates errors from the API', async () => {
    mockRequest.mockRejectedValue(new Error('Too many requests'))

    await expect(rotateToken('sk_old_secret')).rejects.toThrow('Too many requests')
  })
})

describe('getTokens', () => {
  test('returns robots as reported by the API', async () => {
    mockRequest.mockResolvedValue({data: [testRobot], nextCursor: null})

    const tokens = await getTokens(testProjectId)

    expect(mockRequest).toHaveBeenCalledWith({
      query: {},
      url: `/access/project/${testProjectId}/robots`,
    })
    expect(tokens).toEqual([testRobot])
  })

  test('follows nextCursor across pages', async () => {
    mockRequest
      .mockResolvedValueOnce({data: [testRobot], nextCursor: 'cursor-1'})
      .mockResolvedValueOnce({data: [{...testRobot, id: 'robot-2'}], nextCursor: null})

    const tokens = await getTokens(testProjectId)

    expect(mockRequest).toHaveBeenNthCalledWith(1, {
      query: {},
      url: `/access/project/${testProjectId}/robots`,
    })
    expect(mockRequest).toHaveBeenNthCalledWith(2, {
      query: {nextCursor: 'cursor-1'},
      url: `/access/project/${testProjectId}/robots`,
    })
    expect(tokens.map((token) => token.id)).toEqual(['robot-1', 'robot-2'])
  })

  test('excludes robots managed by an organization', async () => {
    const orgManagedRobot: Robot = {
      ...testRobot,
      id: 'robot-org',
      managedBy: {resourceId: 'org-1', resourceType: 'organization'},
    }
    const projectManagedRobot: Robot = {
      ...testRobot,
      id: 'robot-project',
      managedBy: {resourceId: testProjectId, resourceType: 'project'},
    }
    mockRequest.mockResolvedValue({
      data: [orgManagedRobot, projectManagedRobot, testRobot],
      nextCursor: null,
    })

    const tokens = await getTokens(testProjectId)

    expect(tokens.map((token) => token.id)).toEqual(['robot-project', 'robot-1'])
  })

  test('propagates errors from the API', async () => {
    mockRequest.mockRejectedValue(new Error('Unauthorized'))

    await expect(getTokens(testProjectId)).rejects.toThrow('Unauthorized')
  })
})

describe('getProjectMembership', () => {
  test('returns the membership matching the requested project', async () => {
    const otherMembership: Membership = {
      resourceId: 'other-project',
      resourceType: 'project',
      roleNames: ['administrator'],
    }
    const robot: Robot = {...testRobot, memberships: [otherMembership, projectMembership]}

    expect(getProjectMembership(robot, testProjectId)).toBe(projectMembership)
  })

  test('returns undefined when the robot has no membership for the project', async () => {
    expect(getProjectMembership({...testRobot, memberships: []}, testProjectId)).toBeUndefined()
  })
})

describe('getTokenRoles', () => {
  test('fetches roles across pages', async () => {
    const viewerRole = {
      appliesToRobots: true,
      appliesToUsers: true,
      description: 'Can read documents',
      isCustom: false,
      name: 'viewer',
      resourceId: testProjectId,
      resourceType: 'project',
      title: 'Viewer',
    }
    const editorRole = {...viewerRole, name: 'editor', title: 'Editor'}

    mockRequest
      .mockResolvedValueOnce({data: [viewerRole], nextCursor: 'cursor-1'})
      .mockResolvedValueOnce({data: [editorRole], nextCursor: null})

    const roles = await getTokenRoles(testProjectId)

    expect(mockRequest).toHaveBeenNthCalledWith(1, {
      query: {},
      url: `/access/project/${testProjectId}/roles`,
    })
    expect(mockRequest).toHaveBeenNthCalledWith(2, {
      query: {nextCursor: 'cursor-1'},
      url: `/access/project/${testProjectId}/roles`,
    })
    expect(roles.map((role) => role.name)).toEqual(['viewer', 'editor'])
  })

  test('propagates errors from the API', async () => {
    mockRequest.mockRejectedValue(new Error('Unauthorized'))

    await expect(getTokenRoles(testProjectId)).rejects.toThrow('Unauthorized')
  })
})
