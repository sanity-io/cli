import {input, select} from '@inquirer/prompts'
import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {getCliConfig} from '../../../../../cli-core/src/config/cli/getCliConfig.js'
import {getProjectCliClient} from '../../../../../cli-core/src/services/apiClient.js'
import {CreateDatasetCommand} from '../create.js'

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../../../cli-core/src/services/apiClient.js', () => ({
  getProjectCliClient: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
}))

const mockGetProjectCliClient = vi.mocked(getProjectCliClient)
const mockGetCliConfig = vi.mocked(getCliConfig)
const mockInput = vi.mocked(input)
const mockSelect = vi.mocked(select)

const createMockClient = (overrides: Record<string, unknown> = {}) => {
  const defaultDatasets = {
    create: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  }

  const datasetsOverrides = overrides.datasets as Record<string, unknown> | undefined

  return {
    datasets: datasetsOverrides ? {...defaultDatasets, ...datasetsOverrides} : defaultDatasets,
    request: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

describe('#dataset:create', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['dataset create', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Create a new dataset within your project

      USAGE
        $ sanity dataset create [NAME] [--visibility custom|private|public]

      ARGUMENTS
        [NAME]  Name of the dataset to create

      FLAGS
        --visibility=<option>  Set visibility for this dataset (custom/private/public)
                               <options: custom|private|public>

      DESCRIPTION
        Create a new dataset within your project

      EXAMPLES
        Interactively create a dataset

          $ sanity dataset create

        Create a dataset named "my-dataset"

          $ sanity dataset create my-dataset

        Create a private dataset named "my-dataset"

          $ sanity dataset create my-dataset --visibility private

      "
    `)
  })

  test('creates dataset with provided name', async () => {
    const mockClient = createMockClient()
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    const {stdout} = await testCommand(CreateDatasetCommand, ['my-dataset'])

    expect(mockClient.datasets.create).toHaveBeenCalledWith('my-dataset', {
      aclMode: 'public',
    })
    expect(stdout).toContain('Dataset created successfully')
  })

  test('prompts for dataset name when not provided', async () => {
    const mockClient = createMockClient()
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)
    mockInput.mockResolvedValue('test-dataset')

    const {stdout} = await testCommand(CreateDatasetCommand, [])

    expect(mockInput).toHaveBeenCalledWith({
      message: 'Dataset name:',
      validate: expect.any(Function),
    })
    expect(mockClient.datasets.create).toHaveBeenCalledWith('test-dataset', {
      aclMode: 'public',
    })
    expect(stdout).toContain('Dataset created successfully')
  })

  test('errors when dataset name is invalid', async () => {
    const {error} = await testCommand(CreateDatasetCommand, ['Invalid-Dataset-Name'])

    expect(error?.message).toContain('must be all lowercase')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when dataset already exists', async () => {
    const mockClient = createMockClient({
      datasets: {
        create: vi.fn(),
        list: vi.fn().mockResolvedValue([
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
        ]),
      },
    })
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    const {error} = await testCommand(CreateDatasetCommand, ['production'])

    expect(error?.message).toContain('Dataset "production" already exists')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors with invalid visibility flag', async () => {
    const {error} = await testCommand(CreateDatasetCommand, [
      'my-dataset',
      '--visibility',
      'invalid',
    ])

    expect(error?.message).toContain(
      'Expected --visibility=invalid to be one of: custom, private, public',
    )
    expect(error?.oclif?.exit).toBe(2)
  })

  test('handles dataset creation errors', async () => {
    const mockClient = createMockClient({
      datasets: {
        create: vi.fn().mockRejectedValue(new Error('API Error')),
        list: vi.fn().mockResolvedValue([]),
      },
    })
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    const {error} = await testCommand(CreateDatasetCommand, ['my-dataset'])

    expect(error?.message).toContain('Dataset creation failed: API Error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles fetch project data errors', async () => {
    const mockClient = createMockClient({
      datasets: {
        create: vi.fn(),
        list: vi.fn().mockRejectedValue(new Error('Network error')),
      },
    })
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    const {error} = await testCommand(CreateDatasetCommand, ['my-dataset-fail'])

    expect(error?.message).toContain('Failed to fetch project data: Network error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('prompts for dataset visibility when private datasets available and no flag provided', async () => {
    const mockClient = createMockClient({
      request: vi.fn().mockResolvedValue(['privateDataset']),
    })
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)
    mockSelect.mockResolvedValue('private')

    const {stderr, stdout} = await testCommand(CreateDatasetCommand, ['my-dataset'])

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
    expect(mockClient.datasets.create).toHaveBeenCalledWith('my-dataset', {
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
      const mockClient = createMockClient({
        request: vi.fn().mockResolvedValue(hasPrivateFeature ? ['privateDataset'] : []),
      })
      mockGetProjectCliClient.mockResolvedValue(mockClient as never)

      const {stderr, stdout} = await testCommand(CreateDatasetCommand, [
        'my-dataset',
        '--visibility',
        visibility,
      ])

      expect(mockClient.datasets.create).toHaveBeenCalledWith('my-dataset', {
        aclMode: expectedAclMode,
      })
      expect(stdout).toContain('Dataset created successfully')

      if (expectWarning) {
        expect(stderr).toContain('Private datasets are not available for this project')
      }
    })
  })

  test('handles client request failure independently from listDatasets', async () => {
    const mockClient = createMockClient({
      datasets: {
        create: vi.fn(),
        list: vi.fn().mockResolvedValue([]),
      },
      request: vi.fn().mockRejectedValue(new Error('Features API error')), // This fails
    })
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    const {error} = await testCommand(CreateDatasetCommand, ['my-dataset'])

    expect(error?.message).toContain('Failed to fetch project data: Features API error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when no project ID is found', async () => {
    mockGetCliConfig.mockResolvedValueOnce({
      api: undefined,
    } as never)

    const {error} = await testCommand(CreateDatasetCommand, ['my-dataset'])

    expect(error?.message).toContain('sanity.cli.ts does not contain a project identifier')
    expect(error?.oclif?.exit).toBe(1)
  })
})
