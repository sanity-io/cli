import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

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
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      dataset: 'production',
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../cli-core/src/services/apiClient.js', () => ({
  getProjectCliClient: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

// Mock the project API client
const mockGetDocument = vi.fn()

// Get the mocked functions
const mockedGetCliConfig = vi.mocked(getCliConfig)
const mockedGetProjectCliClient = vi.mocked(getProjectCliClient)

describe('documents get', () => {
  beforeEach(() => {
    mockedGetProjectCliClient.mockResolvedValue({
      getDocument: mockGetDocument,
    } as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockGetDocument.mockReset()
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

    mockGetDocument.mockResolvedValue(mockDoc)

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

    mockGetDocument.mockResolvedValue(mockDoc)

    const {stdout} = await testCommand(GetDocumentCommand, ['test-doc', '--pretty'])

    expect(stdout).toContain('test-doc')
    expect(stdout).toContain('Test Post')
    expect(mockGetDocument).toHaveBeenCalledWith('test-doc')
  })

  test('uses custom dataset when --dataset flag is provided', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
    }

    mockGetDocument.mockResolvedValue(mockDoc)

    await testCommand(GetDocumentCommand, ['test-doc', '--dataset', 'staging'])

    expect(mockGetDocument).toHaveBeenCalledWith('test-doc')
    // Verify that the getProjectCliClient was called with the staging dataset
    expect(mockedGetProjectCliClient).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: 'staging',
        projectId: 'test-project',
      }),
    )
  })

  test('throws error when document is not found', async () => {
    mockGetDocument.mockResolvedValue(null)

    const {error} = await testCommand(GetDocumentCommand, ['nonexistent-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Document "nonexistent-doc" not found')
    expect(mockGetDocument).toHaveBeenCalledWith('nonexistent-doc')
  })

  test('throws error when no project ID is configured', async () => {
    mockedGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: undefined,
      },
    })

    const {error} = await testCommand(GetDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)

    // Restore the original mock for other tests
    mockedGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: 'test-project',
      },
    })
  })

  test('throws error when no dataset is configured and none provided', async () => {
    mockedGetCliConfig.mockResolvedValueOnce({
      api: {
        dataset: undefined,
        projectId: 'test-project',
      },
    })

    const {error} = await testCommand(GetDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No dataset specified')
  })

  test('handles client errors gracefully', async () => {
    mockGetDocument.mockRejectedValue(new Error('Network error'))

    const {error} = await testCommand(GetDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch document: Network error')
    expect(mockGetDocument).toHaveBeenCalledWith('test-doc')
  })

  test('requires document ID argument', async () => {
    const {error} = await testCommand(GetDocumentCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing 1 required arg')
  })
})
