import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {CopyDatasetCommand} from '../../../../src/commands/datasets/copy.js'
import {DATASET_API_VERSION, followCopyJobProgress} from '../../../../src/services/datasets.js'

const mockListDatasets = vi.hoisted(() => vi.fn())
const mockGetProjectCliClient = vi.hoisted(() => vi.fn())
const testProjectId = vi.hoisted(() => 'test-project')
const testToken = vi.hoisted(() => 'test-token')

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()

  // Dynamically create a test client based on the projectId passed to getProjectCliClient,
  // so that HTTP requests target the correct host (e.g. other-project.api.sanity.io).
  mockGetProjectCliClient.mockImplementation((options?: {projectId?: string}) => {
    const client = createTestClient({
      apiVersion: 'v2025-09-16',
      projectId: options?.projectId ?? testProjectId,
      token: testToken,
    })
    return Promise.resolve({
      datasets: {
        list: mockListDatasets,
      } as never,
      request: client.request,
    })
  })

  return {
    ...actual,
    getProjectCliClient: mockGetProjectCliClient,
  }
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: vi.fn(),
    select: vi.fn(),
  }
})

vi.mock('../../../prompts/promptForProject.js', async () => {
  const {NonInteractiveError} =
    await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    promptForProject: vi.fn().mockRejectedValue(new NonInteractiveError('select')),
  }
})

vi.mock('../../../services/datasets.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/services/datasets.js')>()
  return {
    ...actual,
    // Keep only followCopyJobProgress mocked since it uses EventSource streaming
    followCopyJobProgress: vi.fn(),
  }
})

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: testToken,
}

const mockFollowCopyJobProgress = vi.mocked(followCopyJobProgress)

function createMockDataset(name: string) {
  return {
    aclMode: 'public' as const,
    addonFor: null,
    createdAt: '2023-01-01T00:00:00Z',
    createdByUserId: 'test-user',
    datasetProfile: 'default',
    features: [],
    name,
    tags: [],
  }
}

describe('#dataset:copy', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  describe('copy mode', () => {
    test('copies dataset with detach flag (does not wait for completion)', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockApi({
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        projectId: testProjectId,
        uri: `/datasets/production/copy`,
      }).reply(200, {jobId: 'job-detach'})

      const {stdout} = await testCommand(CopyDatasetCommand, ['production', 'backup', '--detach'], {
        mocks: defaultMocks,
      })

      expect(stdout).toContain('Job job-detach started')
      expect(stdout).not.toContain('Job job-detach completed')
      expect(mockFollowCopyJobProgress).not.toHaveBeenCalled()
    })

    test('handles copy dataset errors', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockApi({
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        projectId: testProjectId,
        uri: `/datasets/production/copy`,
      }).reply(500, {
        error: 'Insufficient permissions',
        message: 'Insufficient permissions',
      })

      const {error} = await testCommand(CopyDatasetCommand, ['production', 'backup'], {
        mocks: defaultMocks,
      })

      expect(error?.message).toContain('Dataset copying failed')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles fetch datasets error', async () => {
      mockListDatasets.mockRejectedValue(new Error('Network error'))

      const {error} = await testCommand(CopyDatasetCommand, ['production', 'backup'], {
        mocks: defaultMocks,
      })

      expect(error?.message).toContain('Failed to fetch datasets: Network error')
      expect(error?.oclif?.exit).toBe(1)
    })
  })
})
