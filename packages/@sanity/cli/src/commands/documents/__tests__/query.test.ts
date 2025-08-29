import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import chalk from 'chalk'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {QueryDocumentCommand} from '../query.js'

// Mock the config functions
vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../../../cli-core/src/services/apiClient.js', () => ({
  getProjectCliClient: vi.fn(),
}))

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockGetProjectCliClient = vi.mocked(getProjectCliClient)
const testProjectId = 'test-project'
const testDataset = 'production'

describe('#documents:query', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['documents query', '--help'])

    expect(stdout).toContain('Query for documents')
    expect(stdout).toContain('ARGUMENTS')
    expect(stdout).toContain('QUERY')
    expect(stdout).toContain('--pretty')
    expect(stdout).toContain('--dataset')
    expect(stdout).toContain('--api-version')
    expect(stdout).toContain('--anonymous')
  })

  test('executes query successfully with basic options', async () => {
    const mockResults = [
      {
        _id: 'movie1',
        _type: 'movie',
        title: 'The Matrix',
      },
      {
        _id: 'movie2',
        _type: 'movie',
        title: 'Inception',
      },
    ]

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    // Mock the getProjectApiClient to return a mock client with fetch
    const mockFetch = vi.fn().mockResolvedValue(mockResults)
    mockGetProjectCliClient.mockResolvedValue({
      fetch: mockFetch,
    } as never)

    const {stdout} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]'])

    expect(stdout).toContain('"_id": "movie1"')
    expect(stdout).toContain('"title": "The Matrix"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
    
    // Verify that getProjectCliClient was called with requireUser: true by default
    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: expect.any(String),
      dataset: testDataset,
      projectId: testProjectId,
      requireUser: true,
    })
  })

  test('executes query with pretty flag for colorized output', async () => {
    const mockResults = [{_id: 'test', title: 'Test Movie'}]

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockFetch = vi.fn().mockResolvedValue(mockResults)
    mockGetProjectCliClient.mockResolvedValue({
      fetch: mockFetch,
    } as never)

    const originalChalkLevel = chalk.level
    // Force colorization
    chalk.level = 3

    const {stdout} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]', '--pretty'], {
      capture: {
        stripAnsi: false,
      },
    })

    // Reset chalk level
    chalk.level = originalChalkLevel

    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
    expect(stdout).toContain('"_id"')
    expect(stdout).toContain('test')
  })

  test('uses dataset flag to override config', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]
    const overrideDataset = 'staging'

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockFetch = vi.fn().mockResolvedValue(mockResults)
    mockGetProjectCliClient.mockResolvedValue({
      fetch: mockFetch,
    } as never)

    const {stdout} = await testCommand(QueryDocumentCommand, [
      '*[_type == "movie"]',
      '--dataset',
      overrideDataset,
    ])

    expect(stdout).toContain('"_id": "test"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
  })

  test('uses project flag to override config', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]
    const overrideProject = 'other-project'

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockFetch = vi.fn().mockResolvedValue(mockResults)
    mockGetProjectCliClient.mockResolvedValue({
      fetch: mockFetch,
    } as never)

    const {stdout} = await testCommand(QueryDocumentCommand, [
      '*[_type == "movie"]',
      '--project',
      overrideProject,
    ])

    expect(stdout).toContain('"_id": "test"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
  })

  test('uses anonymous flag to skip authentication', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockFetch = vi.fn().mockResolvedValue(mockResults)
    mockGetProjectCliClient.mockResolvedValue({
      fetch: mockFetch,
    } as never)

    const {stdout} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]', '--anonymous'])

    expect(stdout).toContain('"_id": "test"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
    
    // Verify that getProjectCliClient was called with requireUser: false
    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: expect.any(String),
      dataset: testDataset,
      projectId: testProjectId,
      requireUser: false,
    })
  })

  test('uses custom API version', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]
    const customApiVersion = 'v2021-06-07'

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockFetch = vi.fn().mockResolvedValue(mockResults)
    mockGetProjectCliClient.mockResolvedValue({
      fetch: mockFetch,
    } as never)

    const {stdout} = await testCommand(QueryDocumentCommand, [
      '*[_type == "movie"]',
      '--api-version',
      customApiVersion,
    ])

    expect(stdout).toContain('"_id": "test"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
  })

  test('shows warning when API version is not specified', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockFetch = vi.fn().mockResolvedValue(mockResults)
    mockGetProjectCliClient.mockResolvedValue({
      fetch: mockFetch,
    } as never)

    const {stderr, stdout} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]'])

    expect(stderr).toContain('--api-version not specified, using `2025-08-15`')
    expect(stdout).toContain('"_id": "test"')
  })

  test('fails when no project ID is configured or provided', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
      },
    })

    const {error} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('sanity.cli.ts does not contain a project identifier')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when no dataset is configured or provided', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: testProjectId,
      },
    })

    const {error} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No dataset specified')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when query returns null/undefined', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockFetch = vi.fn().mockResolvedValue(null)
    mockGetProjectCliClient.mockResolvedValue({
      fetch: mockFetch,
    } as never)

    const {error} = await testCommand(QueryDocumentCommand, ['*[_type == "nonexistent"]'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Query returned no results')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles query execution errors', async () => {
    const queryError = new Error('Invalid query syntax')

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockFetch = vi.fn().mockRejectedValue(queryError)
    mockGetProjectCliClient.mockResolvedValue({
      fetch: mockFetch,
    } as never)

    const {error} = await testCommand(QueryDocumentCommand, ['invalid query'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Invalid GROQ query syntax: Invalid query syntax')
    expect(error?.message).toContain('Query: invalid query')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('supports environment variable for API version', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]
    const envApiVersion = 'v2023-01-01'

    // Mock environment variable
    vi.stubEnv('SANITY_CLI_QUERY_API_VERSION', envApiVersion)

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockFetch = vi.fn().mockResolvedValue(mockResults)
    mockGetProjectCliClient.mockResolvedValue({
      fetch: mockFetch,
    } as never)

    const {stdout} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]'])

    expect(stdout).toContain('"_id": "test"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')

    vi.unstubAllEnvs()
  })
})