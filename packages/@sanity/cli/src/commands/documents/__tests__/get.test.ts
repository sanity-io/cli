import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import chalk from 'chalk'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {GetDocumentCommand} from '../get.js'

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

describe('#documents:get', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['documents get', '--help'])

    expect(stdout).toContain('Get and print a document by ID')
    expect(stdout).toContain('ARGUMENTS')
    expect(stdout).toContain('DOCUMENTID')
  })

  test('retrieves and displays a document successfully', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      content: 'This is a test post',
      title: 'Test Post',
    }

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    // Mock the getProjectApiClient to return a mock client with getDocument
    const mockGetDocument = vi.fn().mockResolvedValue(mockDoc)
    mockGetProjectCliClient.mockResolvedValue({
      getDocument: mockGetDocument,
    } as never)

    const {stdout} = await testCommand(GetDocumentCommand, ['test-doc'])

    expect(stdout).toContain('"_id": "test-doc"')
    expect(stdout).toContain('"title": "Test Post"')
    expect(mockGetDocument).toHaveBeenCalledWith('test-doc')
  })

  test('displays colorized output when --pretty flag is used', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    // Mock the getProjectApiClient to return a mock client with getDocument
    const mockGetDocument = vi.fn().mockResolvedValue(mockDoc)
    mockGetProjectCliClient.mockResolvedValue({
      getDocument: mockGetDocument,
    } as never)

    const originalChalkLevel = chalk.level
    // Force colorization
    chalk.level = 3

    const {stdout} = await testCommand(GetDocumentCommand, ['test-doc', '--pretty'], {
      capture: {
        stripAnsi: false,
      },
    })

    // Reset chalk level
    chalk.level = originalChalkLevel

    // Check that the output contains the document data
    expect(stdout).toContain('test-doc')
    expect(stdout).toContain('Test Post')
    expect(stdout).toContain('_id')
    expect(stdout).toContain('_type')
    expect(stdout).toContain('title')

    // eslint-disable-next-line no-control-regex
    expect(stdout).toMatch(/\u001B\[\d+m/)
    expect(mockGetDocument).toHaveBeenCalledWith('test-doc')
  })

  test('uses custom dataset when --dataset flag is provided', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    // Mock the getProjectApiClient to return a mock client with getDocument
    const mockGetDocument = vi.fn().mockResolvedValue(mockDoc)
    mockGetProjectCliClient.mockResolvedValue({
      getDocument: mockGetDocument,
    } as never)

    const {stdout} = await testCommand(GetDocumentCommand, ['test-doc', '--dataset', 'staging'])

    expect(stdout).toContain('"_id": "test-doc"')
    expect(stdout).toContain('"title": "Test Post"')
    expect(mockGetDocument).toHaveBeenCalledWith('test-doc')
  })

  test('throws error when document is not found', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    // Mock the getProjectApiClient to return a mock client with getDocument returning null
    const mockGetDocument = vi.fn().mockResolvedValue(null)
    mockGetProjectCliClient.mockResolvedValue({
      getDocument: mockGetDocument,
    } as never)

    const {error} = await testCommand(GetDocumentCommand, ['nonexistent-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Document "nonexistent-doc" not found')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockGetDocument).toHaveBeenCalledWith('nonexistent-doc')
  })

  test('throws error when no project ID is configured', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: undefined,
      },
    })

    const {error} = await testCommand(GetDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no dataset is configured and none provided', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: undefined,
        projectId: testProjectId,
      },
    })

    const {error} = await testCommand(GetDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No dataset specified')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles client errors gracefully', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    // Mock the getProjectApiClient to return a mock client with getDocument throwing an error
    const mockGetDocument = vi.fn().mockRejectedValue(new Error('Network error'))
    mockGetProjectCliClient.mockResolvedValue({
      getDocument: mockGetDocument,
    } as never)

    const {error} = await testCommand(GetDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch document')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockGetDocument).toHaveBeenCalledWith('test-doc')
  })

  test('requires document ID argument', async () => {
    const {error} = await testCommand(GetDocumentCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing 1 required arg')
    expect(error?.oclif?.exit).toBe(2)
  })
})
