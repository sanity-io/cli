import {input, select} from '@sanity/cli-core/ux'
import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures.js'
import {CreateDatasetCommand} from '../create.js'

const mockListDatasets = vi.hoisted(() => vi.fn())
const mockCreateDataset = vi.hoisted(() => vi.fn())
const testProjectId = vi.hoisted(() => 'test-project')
const testToken = vi.hoisted(() => 'test-token')

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')

  const testClient = createTestClient({
    apiVersion: 'v2025-09-16',
    projectId: testProjectId,
    token: testToken,
  })

  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        create: mockCreateDataset,
        list: mockListDatasets,
      } as never,
      request: testClient.request,
    }),
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

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockInput = vi.mocked(input)
const mockSelect = vi.mocked(select)

describe('#dataset:create', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('creates dataset with provided name', async () => {
    mockListDatasets.mockResolvedValue([])

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: '/features',
    }).reply(200, [])
    mockCreateDataset.mockResolvedValue(undefined as never)

    const {stdout} = await testCommand(CreateDatasetCommand, ['my-dataset'], {
      mocks: defaultMocks,
    })

    expect(mockCreateDataset).toHaveBeenCalledWith('my-dataset', {
      aclMode: 'public',
    })
    expect(stdout).toContain('Dataset created successfully')
  })

  test('prompts for dataset name when not provided', async () => {
    mockListDatasets.mockResolvedValue([])
    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: '/features',
    }).reply(200, [])
    mockCreateDataset.mockResolvedValue(undefined as never)
    mockInput.mockResolvedValue('test-dataset')

    const {stdout} = await testCommand(CreateDatasetCommand, [], {
      mocks: defaultMocks,
    })

    expect(mockInput).toHaveBeenCalledWith({
      message: 'Dataset name:',
      validate: expect.any(Function),
    })
    expect(mockCreateDataset).toHaveBeenCalledWith('test-dataset', {
      aclMode: 'public',
    })
    expect(stdout).toContain('Dataset created successfully')
  })

  test('errors when dataset name is invalid', async () => {
    const {error} = await testCommand(CreateDatasetCommand, ['Invalid-Dataset-Name'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('must be all lowercase')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when dataset already exists', async () => {
    mockListDatasets.mockResolvedValue([
      {
        aclMode: 'public',
        addonFor: null,
        createdAt: '2023-01-01T00:00:00Z',
        createdByUserId: 'user1',
        datasetProfile: 'default',
        features: [],
        name: 'production',
        tags: [],
      },
    ])
    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: '/features',
    }).reply(200, [])

    const {error} = await testCommand(CreateDatasetCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Dataset "production" already exists')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors with invalid visibility flag', async () => {
    const {error} = await testCommand(
      CreateDatasetCommand,
      ['my-dataset', '--visibility', 'invalid'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain(
      'Expected --visibility=invalid to be one of: custom, private, public',
    )
    expect(error?.oclif?.exit).toBe(2)
  })

  test('handles dataset creation errors', async () => {
    mockListDatasets.mockResolvedValue([])
    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: '/features',
    }).reply(200, [])
    mockCreateDataset.mockRejectedValue(new Error('API Error'))

    const {error} = await testCommand(CreateDatasetCommand, ['my-dataset'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to create dataset: API Error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('prompts for dataset visibility when private datasets available and no flag provided', async () => {
    mockListDatasets.mockResolvedValue([])
    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: '/features',
    }).reply(200, ['privateDataset'])
    mockCreateDataset.mockResolvedValue(undefined as never)
    mockSelect.mockResolvedValue('private')

    const {stderr, stdout} = await testCommand(CreateDatasetCommand, ['my-dataset'], {
      mocks: defaultMocks,
    })

    expect(mockSelect).toHaveBeenCalledWith({
      choices: [
        {
          name: 'Public (world readable)',
          value: 'public',
        },
        {
          name: 'Private (Authenticated user or token needed)',
          value: 'private',
        },
      ],
      message: 'Dataset visibility',
    })
    expect(mockCreateDataset).toHaveBeenCalledWith('my-dataset', {
      aclMode: 'private',
    })
    expect(stdout).toContain('Dataset created successfully')
    expect(stderr).toContain('Please note that while documents are private')
  })

  describe('visibility flag handling', () => {
    test.each([
      {
        expectedAclMode: 'public',
        expectWarning: false,
        hasPrivateFeature: true,
        testName: 'creates public dataset when privateDataset feature available',
        visibility: 'public',
      },
      {
        expectedAclMode: 'private',
        expectWarning: false,
        hasPrivateFeature: true,
        testName: 'creates private dataset when privateDataset feature available',
        visibility: 'private',
      },
      {
        expectedAclMode: 'custom',
        expectWarning: false,
        hasPrivateFeature: true,
        testName: 'creates custom dataset when privateDataset feature available',
        visibility: 'custom',
      },
      {
        expectedAclMode: 'public',
        expectWarning: false,
        hasPrivateFeature: false,
        testName: 'creates public dataset when privateDataset feature not available',
        visibility: 'public',
      },
      {
        expectedAclMode: 'public',
        expectWarning: true,
        hasPrivateFeature: false,
        testName: 'creates public dataset with warning when private requested but not available',
        visibility: 'private',
      },
      {
        expectedAclMode: 'custom',
        expectWarning: false,
        hasPrivateFeature: false,
        testName: 'creates custom dataset when privateDataset feature not available',
        visibility: 'custom',
      },
    ])('$testName', async ({expectedAclMode, expectWarning, hasPrivateFeature, visibility}) => {
      mockListDatasets.mockResolvedValue([])
      mockApi({
        apiVersion: PROJECT_FEATURES_API_VERSION,
        method: 'get',
        projectId: testProjectId,
        uri: '/features',
      }).reply(200, hasPrivateFeature ? ['privateDataset'] : [])
      mockCreateDataset.mockResolvedValue(undefined as never)

      const {stderr, stdout} = await testCommand(
        CreateDatasetCommand,
        ['my-dataset', '--visibility', visibility],
        {mocks: defaultMocks},
      )

      expect(mockCreateDataset).toHaveBeenCalledWith('my-dataset', {
        aclMode: expectedAclMode,
      })
      expect(stdout).toContain('Dataset created successfully')

      if (expectWarning) {
        expect(stderr).toContain('Private datasets are not available for this project')
      }
    })
  })

  test('handles client request failure independently from listDatasets', async () => {
    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: '/features',
    }).reply(500, {error: 'Features API error'})

    const {error} = await testCommand(CreateDatasetCommand, ['my-dataset'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to fetch project data: Features API error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('creates dataset with --embeddings flag', async () => {
    mockListDatasets.mockResolvedValue([])
    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: '/features',
    }).reply(200, [])
    mockCreateDataset.mockResolvedValue(undefined as never)

    const {stdout} = await testCommand(CreateDatasetCommand, ['my-dataset', '--embeddings'], {
      mocks: defaultMocks,
    })

    expect(mockCreateDataset).toHaveBeenCalledWith('my-dataset', {
      aclMode: 'public',
      embeddings: {enabled: true},
    })
    expect(stdout).toContain('Dataset created successfully')
  })

  test('creates dataset with --embeddings and --embeddings-projection flags', async () => {
    mockListDatasets.mockResolvedValue([])
    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: '/features',
    }).reply(200, [])
    mockCreateDataset.mockResolvedValue(undefined as never)

    const {stdout} = await testCommand(
      CreateDatasetCommand,
      ['my-dataset', '--embeddings', '--embeddings-projection', '{ title, body }'],
      {mocks: defaultMocks},
    )

    expect(mockCreateDataset).toHaveBeenCalledWith('my-dataset', {
      aclMode: 'public',
      embeddings: {enabled: true, projection: '{ title, body }'},
    })
    expect(stdout).toContain('Dataset created successfully')
  })

  test('errors when no project ID is found', async () => {
    const {error} = await testCommand(CreateDatasetCommand, ['my-dataset'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: undefined},
      },
    })

    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })
})
