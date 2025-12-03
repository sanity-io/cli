import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {deleteSchemaAction} from '../deleteSchemaAction'
import {type SchemaStoreContext} from '../schemaStoreTypes'

// Mock dependencies
const mockOutput = {
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}

const mockApiClient = vi.fn()
const mockJsonReader = vi.fn()
const mockManifestExtractor = vi.fn()

const mockManifest = {
  createdAt: '2024-01-01T00:00:00.000Z',
  studioVersion: '3.0.0',
  version: 3,
  workspaces: [
    {
      basePath: '/',
      dataset: 'production',
      icon: null,
      name: 'default',
      projectId: 'test-project',
      schema: 'default.create-schema.json',
      tools: 'default.create-tools.json',
    },
    {
      basePath: '/staging',
      dataset: 'staging',
      icon: null,
      name: 'staging',
      projectId: 'test-project',
      schema: 'staging.create-schema.json',
      tools: 'staging.create-tools.json',
    },
  ],
}

describe('deleteSchemaAction', () => {
  let context: SchemaStoreContext
  let mockClientWithConfig: {
    config: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    withConfig: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Setup client with config mock - needs withConfig for chaining
    mockClientWithConfig = {
      config: vi.fn().mockReturnValue({dataset: 'production', projectId: 'test-project'}),
      delete: vi.fn().mockResolvedValue({results: [{id: 'test-id'}]}),
      withConfig: vi.fn(),
    }
    // Make withConfig return itself for chaining
    mockClientWithConfig.withConfig.mockReturnValue(mockClientWithConfig)

    // Setup API client to return a client that has withConfig
    mockApiClient.mockResolvedValue({
      config: vi.fn().mockReturnValue({dataset: 'production', projectId: 'test-project'}),
      withConfig: vi.fn().mockReturnValue(mockClientWithConfig),
    })

    mockManifestExtractor.mockResolvedValue(undefined)

    mockJsonReader.mockImplementation(async (filePath: string) => {
      if (filePath.includes('create-manifest.json')) {
        return {
          lastModified: '2024-01-01T00:00:00.000Z',
          parsedJson: mockManifest,
          path: filePath,
        }
      }
      return undefined
    })

    // Setup default context
    context = {
      apiClient: mockApiClient as never,
      jsonReader: mockJsonReader as never,
      manifestExtractor: mockManifestExtractor as never,
      output: mockOutput as never,
      workDir: '/test/path',
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('successfully deletes a single schema', async () => {
    mockClientWithConfig.delete.mockResolvedValue({results: [{id: 'system.schema.default'}]})

    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: 'system.schema.default',
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.log).toHaveBeenCalledWith('Successfully deleted 1/1 schemas')
    expect(mockClientWithConfig.delete).toHaveBeenCalledWith('system.schema.default')
    expect(mockClientWithConfig.delete).toHaveBeenCalledTimes(2) // Called once per dataset
  })

  test('successfully deletes multiple schemas', async () => {
    mockClientWithConfig.delete
      .mockResolvedValueOnce({results: [{id: 'system.schema.default'}]})
      .mockResolvedValueOnce({results: [{id: 'system.schema.staging'}]})
      .mockResolvedValueOnce({results: [{id: 'system.schema.default'}]})
      .mockResolvedValueOnce({results: [{id: 'system.schema.staging'}]})

    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: 'system.schema.default,system.schema.staging',
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.log).toHaveBeenCalledWith('Successfully deleted 2/2 schemas')
    expect(mockClientWithConfig.delete).toHaveBeenCalledTimes(4) // 2 schemas × 2 datasets
  })

  test('filters schemas by dataset when dataset flag is provided', async () => {
    mockClientWithConfig.delete.mockResolvedValue({results: [{id: 'system.schema.default'}]})

    const result = await deleteSchemaAction(
      {
        dataset: 'production',
        'extract-manifest': false,
        ids: 'system.schema.default',
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockClientWithConfig.delete).toHaveBeenCalledTimes(1) // Only production dataset
  })

  test('returns failure when schema is not found', async () => {
    mockClientWithConfig.delete.mockResolvedValue({results: []}) // Empty results = not found

    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: 'system.schema.nonexistent',
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalled()
    expect(mockOutput.error.mock.calls[0][0]).toContain('Deleted 0/1 schemas')
    expect(mockOutput.error.mock.calls[0][0]).toContain('not found')
  })

  test('returns failure when some schemas are not found', async () => {
    mockClientWithConfig.delete
      .mockResolvedValueOnce({results: [{id: 'system.schema.default'}]})
      .mockResolvedValueOnce({results: []}) // Not found
      .mockResolvedValueOnce({results: [{id: 'system.schema.default'}]})
      .mockResolvedValueOnce({results: []}) // Not found

    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: 'system.schema.default,system.schema.nonexistent',
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalled()
    expect(mockOutput.error.mock.calls[0][0]).toContain('Deleted 1/2 schemas')
  })

  test('handles delete errors gracefully', async () => {
    mockClientWithConfig.delete.mockRejectedValue(new Error('Delete failed'))

    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: 'system.schema.default',
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete schema'),
    )
  })

  test('extracts manifest when extract-manifest is true', async () => {
    mockClientWithConfig.delete.mockResolvedValue({results: [{id: 'system.schema.default'}]})

    await deleteSchemaAction(
      {
        'extract-manifest': true,
        ids: 'system.schema.default',
      },
      context,
    )

    expect(mockManifestExtractor).toHaveBeenCalled()
  })

  test('skips manifest extraction when extract-manifest is false', async () => {
    mockClientWithConfig.delete.mockResolvedValue({results: [{id: 'system.schema.default'}]})

    await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: 'system.schema.default',
      },
      context,
    )

    expect(mockManifestExtractor).not.toHaveBeenCalled()
  })

  test('logs verbose output when verbose flag is enabled', async () => {
    mockClientWithConfig.delete.mockRejectedValue(new Error('Delete failed'))

    await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: 'system.schema.default',
        verbose: true,
      },
      context,
    )

    // Verbose mode should log the full error object
    expect(mockOutput.error).toHaveBeenCalledWith(expect.any(Error))
  })

  test('throws error when manifest extraction fails with schemaRequired', async () => {
    mockManifestExtractor.mockRejectedValue(new Error('Manifest extraction failed'))

    await expect(
      deleteSchemaAction(
        {
          'extract-manifest': true,
          ids: 'system.schema.default',
        },
        context,
      ),
    ).rejects.toThrow('Manifest extraction failed')
  })

  test('filters workspaces by projectId mismatch', async () => {
    const mismatchManifest = {
      ...mockManifest,
      workspaces: [
        {...mockManifest.workspaces[0], projectId: 'test-project'},
        {...mockManifest.workspaces[1], projectId: 'different-project'},
      ],
    }

    mockJsonReader.mockImplementation(async (filePath: string) => {
      if (filePath.includes('create-manifest.json')) {
        return {
          lastModified: '2024-01-01T00:00:00.000Z',
          parsedJson: mismatchManifest,
          path: filePath,
        }
      }
      return undefined
    })

    mockClientWithConfig.delete.mockResolvedValue({results: [{id: 'system.schema.default'}]})

    await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: 'system.schema.default',
      },
      context,
    )

    // Should warn about project ID mismatch
    expect(mockOutput.warn).toHaveBeenCalled()
    // Should only delete from matching project
    expect(mockClientWithConfig.delete).toHaveBeenCalledTimes(1)
  })
})
