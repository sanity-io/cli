import {getGlobalCliClient} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {deleteSchemaAction} from '../deleteSchemaAction'
import {type SchemaStoreContext} from '../schemaStoreTypes'

// Mock dependencies
const mockOutput = {
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}

const mockJsonReader = vi.fn()
const mockManifestExtractor = vi.fn()
const mockGetGlobalCliClient = vi.mocked(getGlobalCliClient)

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

vi.mock('../../../../../cli-core/src/services/apiClient.js', () => ({
  getGlobalCliClient: vi.fn(),
}))

describe('deleteSchemaAction', () => {
  let context: SchemaStoreContext
  let mockClient: {
    request: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    mockClient = {
      request: vi.fn().mockImplementation(async ({method}: {method: string}) => {
        if (method === 'DELETE') {
          return {deleted: true}
        }

        if (method === 'GET') {
          return {}
        }

        return undefined
      }),
    }

    mockGetGlobalCliClient.mockResolvedValue(mockClient as never)
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
      jsonReader: mockJsonReader as never,
      manifestExtractor: mockManifestExtractor as never,
      output: mockOutput as never,
      projectId: 'test-project',
      workDir: '/test/path',
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('successfully deletes a single schema', async () => {
    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: '_.schemas.default',
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.log).toHaveBeenCalledWith('Successfully deleted 1/1 schemas')
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'DELETE',
      uri: `/projects/test-project/datasets/production/schemas/_.schemas.default`,
    })
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'DELETE',
      uri: `/projects/test-project/datasets/staging/schemas/_.schemas.default`,
    })
  })

  test('successfully deletes multiple schemas', async () => {
    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: '_.schemas.default,_.schemas.staging',
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.log).toHaveBeenCalledWith('Successfully deleted 2/2 schemas')
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'DELETE',
      uri: `/projects/test-project/datasets/production/schemas/_.schemas.default`,
    })
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'DELETE',
      uri: `/projects/test-project/datasets/staging/schemas/_.schemas.default`,
    })
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'DELETE',
      uri: `/projects/test-project/datasets/production/schemas/_.schemas.staging`,
    })
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'DELETE',
      uri: `/projects/test-project/datasets/staging/schemas/_.schemas.staging`,
    })
  })

  test('filters schemas by dataset when dataset flag is provided', async () => {
    mockClient.request.mockResolvedValue({deleted: true})

    const result = await deleteSchemaAction(
      {
        dataset: 'production',
        'extract-manifest': false,
        ids: '_.schemas.default',
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'DELETE',
      uri: `/projects/test-project/datasets/production/schemas/_.schemas.default`,
    })
  })

  test('returns failure when schema is not found', async () => {
    mockClient.request.mockResolvedValue({deleted: false}) // Empty results = not found

    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: '_.schemas.nonexistent',
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalled()
    expect(mockOutput.error.mock.calls[0][0]).toContain('Deleted 0/1 schemas')
    expect(mockOutput.error.mock.calls[0][0]).toContain('not found')
  })

  test('returns failure when some schemas are not found', async () => {
    mockClient.request.mockImplementation(async ({method, uri}: {method: string; uri: string}) => {
      if (method === 'DELETE') {
        return {deleted: uri.includes('_.schemas.default')}
      }

      if (method === 'GET') {
        return {}
      }

      return undefined
    })

    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: '_.schemas.default,_.schemas.nonexistent',
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalled()
    expect(mockOutput.error.mock.calls[0][0]).toContain('Deleted 1/2 schemas')
  })

  test('handles delete errors gracefully', async () => {
    mockClient.request.mockRejectedValue(new Error('Delete failed'))

    const result = await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: '_.schemas.default',
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete schema'),
    )
  })

  test('extracts manifest when extract-manifest is true', async () => {
    await deleteSchemaAction(
      {
        'extract-manifest': true,
        ids: '_.schemas.default',
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(mockManifestExtractor).toHaveBeenCalled()
  })

  test('skips manifest extraction when extract-manifest is false', async () => {
    await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: '_.schemas.default',
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(mockManifestExtractor).not.toHaveBeenCalled()
  })

  test('logs verbose output when verbose flag is enabled', async () => {
    mockClient.request.mockRejectedValue(new Error('Delete failed'))

    await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: '_.schemas.default',
        'manifest-dir': './dist/static',
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
          ids: '_.schemas.default',
          'manifest-dir': './dist/static',
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

    await deleteSchemaAction(
      {
        'extract-manifest': false,
        ids: '_.schemas.default',
        'manifest-dir': './dist/static',
      },
      context,
    )

    // Should warn about project ID mismatch
    expect(mockOutput.warn).toHaveBeenCalled()
    // Should only delete from matching project
    expect(mockClient.request).toHaveBeenCalledTimes(2)
  })
})
