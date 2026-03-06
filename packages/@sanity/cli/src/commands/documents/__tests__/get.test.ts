import {ProjectRootNotFoundError} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {GetDocumentCommand} from '../get.js'

const testProjectId = 'test-project'
const testDataset = 'production'

const defaultMocks = {
  cliConfig: {api: {dataset: testDataset, projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockGetDocument = vi.hoisted(() => vi.fn())
const mockGetProjectCliClient = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    getDocument: mockGetDocument,
  }),
)

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getProjectCliClient: mockGetProjectCliClient,
  }
})

describe('#documents:get', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('retrieves and displays a document successfully', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      content: 'This is a test post',
      title: 'Test Post',
    }

    mockGetDocument.mockResolvedValue(mockDoc)

    const {stdout} = await testCommand(GetDocumentCommand, ['test-doc'], {
      mocks: defaultMocks,
    })

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

    // Set FORCE_COLOR to enable colorization
    vi.stubEnv('FORCE_COLOR', '1')

    const {stdout} = await testCommand(GetDocumentCommand, ['test-doc', '--pretty'], {
      capture: {
        stripAnsi: false,
      },
      mocks: defaultMocks,
    })

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

    mockGetDocument.mockResolvedValue(mockDoc)

    const {stdout} = await testCommand(GetDocumentCommand, ['test-doc', '--dataset', 'staging'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('"_id": "test-doc"')
    expect(stdout).toContain('"title": "Test Post"')
    expect(mockGetDocument).toHaveBeenCalledWith('test-doc')
  })

  test('throws error when document is not found', async () => {
    mockGetDocument.mockResolvedValue(null)

    const {error} = await testCommand(GetDocumentCommand, ['nonexistent-doc'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Document "nonexistent-doc" not found')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockGetDocument).toHaveBeenCalledWith('nonexistent-doc')
  })

  test('throws error when no project ID is configured', async () => {
    const {error} = await testCommand(GetDocumentCommand, ['test-doc'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {dataset: 'production', projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no dataset is configured and none provided', async () => {
    const {error} = await testCommand(GetDocumentCommand, ['test-doc'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {dataset: undefined, projectId: testProjectId}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No dataset specified')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles client errors gracefully', async () => {
    mockGetDocument.mockRejectedValue(new Error('Network error'))

    const {error} = await testCommand(GetDocumentCommand, ['test-doc'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch document')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockGetDocument).toHaveBeenCalledWith('test-doc')
  })

  test('requires document ID argument', async () => {
    const {error} = await testCommand(GetDocumentCommand, [], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing 1 required arg')
    expect(error?.oclif?.exit).toBe(2)
  })

  describe('outside project context', () => {
    const noProjectRootMocks = {
      cliConfigError: new ProjectRootNotFoundError('No project root found'),
      token: 'test-token',
    }

    test('works with --project-id and --dataset flags when there is no project root', async () => {
      const mockDoc = {
        _id: 'test-doc',
        _type: 'post',
        title: 'Test Post',
      }

      mockGetDocument.mockResolvedValue(mockDoc)

      const {error, stdout} = await testCommand(
        GetDocumentCommand,
        ['test-doc', '--project-id', 'flag-project', '--dataset', 'flag-dataset'],
        {mocks: noProjectRootMocks},
      )

      if (error) throw error
      expect(stdout).toContain('"_id": "test-doc"')
      expect(stdout).toContain('"title": "Test Post"')
      expect(mockGetDocument).toHaveBeenCalledWith('test-doc')
    })

    test('errors when outside project context and no --project-id provided', async () => {
      const {error} = await testCommand(GetDocumentCommand, ['test-doc'], {
        mocks: noProjectRootMocks,
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Unable to determine project ID')
    })

    test('errors when outside project context with --project-id but no --dataset', async () => {
      const {error} = await testCommand(
        GetDocumentCommand,
        ['test-doc', '--project-id', 'flag-project'],
        {mocks: noProjectRootMocks},
      )

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('No dataset specified')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('--project-id flag overrides CLI config projectId', async () => {
      const mockDoc = {
        _id: 'test-doc',
        _type: 'post',
        title: 'Test Post',
      }

      mockGetDocument.mockResolvedValue(mockDoc)

      const {error, stdout} = await testCommand(
        GetDocumentCommand,
        ['test-doc', '--project-id', 'override-project'],
        {mocks: defaultMocks},
      )

      if (error) throw error
      expect(stdout).toContain('"_id": "test-doc"')
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({projectId: 'override-project'}),
      )
    })
  })
})
