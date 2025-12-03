import {type SanityClient} from '@sanity/client'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {deleteSchemaAction} from '../deleteSchemaAction'
import {type SchemaStoreContext} from '../schemaStoreTypes'

// Mock dependencies
const mockOutput = {
  error: vi.fn(),
  print: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}

const mockClient = {
  delete: vi.fn(),
  withConfig: vi.fn(),
} as unknown as SanityClient

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

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Setup default context
    context = {
      apiClient: mockApiClient as never,
      jsonReader: mockJsonReader as never,
      manifestExtractor: mockManifestExtractor as never,
      output: mockOutput as never,
      workDir: '/test/path',
    }

    // Setup default mock returns
    mockApiClient.mockReturnValue({
      config: vi.fn().mockReturnValue({projectId: 'test-project'}),
      withConfig: vi.fn().mockReturnThis(),
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

    // Setup client mock chain
    const clientWithConfig = {
      delete: vi.fn().mockResolvedValue({results: [{id: 'test-id'}]}),
    }
    mockClient.withConfig = vi.fn().mockReturnValue(clientWithConfig)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('successfully deletes a single schema', async () => {
    const clientWithConfig = {
      delete: vi.fn().mockResolvedValue({results: [{id: 'system.schema.default'}]}),
    }
    mockClient.withConfig = vi.fn().mockReturnValue(clientWithConfig)

    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: 'system.schema.default',
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.success).toHaveBeenCalledWith('Successfully deleted 1/1 schemas')
    expect(clientWithConfig.delete).toHaveBeenCalledWith('system.schema.default')
  })

  test('successfully deletes multiple schemas', async () => {
    const clientWithConfig = {
      delete: vi
        .fn()
        .mockResolvedValueOnce({results: [{id: 'system.schema.default'}]})
        .mockResolvedValueOnce({results: [{id: 'system.schema.staging'}]}),
    }
    mockClient.withConfig = vi.fn().mockReturnValue(clientWithConfig)

    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: 'system.schema.default,system.schema.staging',
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.success).toHaveBeenCalledWith('Successfully deleted 2/2 schemas')
    expect(clientWithConfig.delete).toHaveBeenCalledTimes(4) // 2 schemas × 2 datasets
  })

  test('filters schemas by dataset when dataset flag is provided', async () => {
    const clientWithConfig = {
      delete: vi.fn().mockResolvedValue({results: [{id: 'system.schema.default'}]}),
    }
    mockClient.withConfig = vi.fn().mockReturnValue(clientWithConfig)

    const result = await deleteSchemaAction(
      {
        dataset: 'production',
        'extract-manifest': false,
        ids: 'system.schema.default',
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockClient.withConfig).toHaveBeenCalledWith({dataset: 'production'})
    expect(clientWithConfig.delete).toHaveBeenCalledTimes(1) // Only production dataset
  })

  test('returns failure when schema is not found', async () => {
    const clientWithConfig = {
      delete: vi.fn().mockResolvedValue({results: []}), // Empty results = not found
    }
    mockClient.withConfig = vi.fn().mockReturnValue(clientWithConfig)

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
    const clientWithConfig = {
      delete: vi
        .fn()
        .mockResolvedValueOnce({results: [{id: 'system.schema.default'}]})
        .mockResolvedValueOnce({results: []}) // Not found
        .mockResolvedValueOnce({results: [{id: 'system.schema.default'}]})
        .mockResolvedValueOnce({results: []}), // Not found
    }
    mockClient.withConfig = vi.fn().mockReturnValue(clientWithConfig)

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
    const clientWithConfig = {
      delete: vi.fn().mockRejectedValue(new Error('Delete failed')),
    }
    mockClient.withConfig = vi.fn().mockReturnValue(clientWithConfig)

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
    const clientWithConfig = {
      delete: vi.fn().mockResolvedValue({results: [{id: 'system.schema.default'}]}),
    }
    mockClient.withConfig = vi.fn().mockReturnValue(clientWithConfig)

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
    const clientWithConfig = {
      delete: vi.fn().mockResolvedValue({results: [{id: 'system.schema.default'}]}),
    }
    mockClient.withConfig = vi.fn().mockReturnValue(clientWithConfig)

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
    const clientWithConfig = {
      delete: vi.fn().mockRejectedValue(new Error('Delete failed')),
    }
    mockClient.withConfig = vi.fn().mockReturnValue(clientWithConfig)

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

  test('returns failure when manifest extraction fails with schemaRequired', async () => {
    mockManifestExtractor.mockRejectedValue(new Error('Manifest extraction failed'))

    const result = await deleteSchemaAction(
      {
        'extract-manifest': true,
        ids: 'system.schema.default',
      },
      context,
    )

    expect(result).toBe('failure')
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

    const clientWithConfig = {
      delete: vi.fn().mockResolvedValue({results: [{id: 'system.schema.default'}]}),
    }
    mockClient.withConfig = vi.fn().mockReturnValue(clientWithConfig)

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
    expect(clientWithConfig.delete).toHaveBeenCalledTimes(1)
  })
})
