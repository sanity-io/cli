import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {vi, describe, test, expect, afterEach} from 'vitest'

import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {Get} from '../get.js'

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
      projectId: 'test-project',
      dataset: 'production',
    },
  }),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

// Mock the Sanity client
const mockGetDocument = vi.fn()
vi.mock('@sanity/client', () => ({
  createClient: vi.fn(() => ({
    getDocument: mockGetDocument,
  })),
}))

describe('documents get', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['documents get', '--help'])

    expect(stdout).toContain('Get and print a document by ID')
    expect(stdout).toContain('ARGUMENTS')
    expect(stdout).toContain('documentId')
  })

  test('retrieves and displays a document successfully', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
      content: 'This is a test post',
    }

    mockGetDocument.mockResolvedValue(mockDoc)

    const {stdout} = await testCommand(Get, ['test-doc'])

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

    const {stdout} = await testCommand(Get, ['test-doc', '--pretty'])

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

    const {createClient} = await import('@sanity/client')
    
    await testCommand(Get, ['test-doc', '--dataset', 'staging'])

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: 'staging',
        projectId: 'test-project',
      })
    )
  })

  test('throws error when document is not found', async () => {
    mockGetDocument.mockResolvedValue(null)

    const {error} = await testCommand(Get, ['nonexistent-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Document "nonexistent-doc" not found')
  })

  test('throws error when no project ID is configured', async () => {
    const {getCliConfig} = await import('../../../../../cli-core/src/config/cli/getCliConfig.js')
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {
        projectId: undefined,
      },
    })

    const {error} = await testCommand(Get, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
  })

  test('throws error when no dataset is configured and none provided', async () => {
    const {getCliConfig} = await import('../../../../../cli-core/src/config/cli/getCliConfig.js')
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {
        projectId: 'test-project',
        dataset: undefined,
      },
    })

    const {error} = await testCommand(Get, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No dataset specified')
  })

  test('handles client errors gracefully', async () => {
    mockGetDocument.mockRejectedValue(new Error('Network error'))

    const {error} = await testCommand(Get, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch document: Network error')
  })

  test('requires document ID argument', async () => {
    const {error} = await testCommand(Get, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing 1 required arg')
  })
})