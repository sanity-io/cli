import {getProjectCliClient} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getProjectById, getProjectClaimStatus, PROJECTS_API_VERSION} from '../projects.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

const mockClient = {
  projects: {
    getById: vi.fn(),
  },
}

const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

beforeEach(() => {
  mockGetProjectCliClient.mockResolvedValue(mockClient as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#getProjectById', () => {
  test('calls client.projects.getById with correct parameters', async () => {
    const mockProject = {displayName: 'Test Project', id: 'test-project'}
    mockClient.projects.getById.mockResolvedValue(mockProject)

    const result = await getProjectById('test-project')

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: PROJECTS_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.projects.getById).toHaveBeenCalledWith('test-project')
    expect(result).toBe(mockProject)
  })
})

describe('#getProjectClaimStatus', () => {
  test('reports an unclaimed project from its holding organization', async () => {
    mockClient.projects.getById.mockResolvedValue({organizationId: 'oSystemUnclaimed'})

    await expect(getProjectClaimStatus('test-project', 'robot-token')).resolves.toBe('unclaimed')
    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: PROJECTS_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
      token: 'robot-token',
    })
  })

  test('reports a project in another organization as claimed', async () => {
    mockClient.projects.getById.mockResolvedValue({organizationId: 'organization-id'})

    await expect(getProjectClaimStatus('test-project', 'robot-token')).resolves.toBe('claimed')
  })

  test('reports an absent organization as unknown', async () => {
    mockClient.projects.getById.mockResolvedValue({})

    await expect(getProjectClaimStatus('test-project', 'robot-token')).resolves.toBe('unknown')
  })

  test('reports lookup failures as unknown', async () => {
    mockClient.projects.getById.mockRejectedValue(new Error('offline'))

    await expect(getProjectClaimStatus('test-project', 'robot-token')).resolves.toBe('unknown')
  })
})
