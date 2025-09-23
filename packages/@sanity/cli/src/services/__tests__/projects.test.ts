import {getProjectCliClient} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getProjectById, PROJECTS_API_VERSION} from '../projects.js'

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
