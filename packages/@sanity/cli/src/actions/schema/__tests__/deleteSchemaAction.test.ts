import {mockApi} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {SCHEMA_API_VERSION} from '../../../services/schemas'
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

const mockSchemas = ['_.schemas.default', '_.schemas.staging']

describe('deleteSchemaAction', () => {
  let context: SchemaStoreContext

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    for (const schema of mockSchemas) {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        uri: `/projects/test-project/datasets/production/schemas/${schema}`,
      }).reply(200, [{}])
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        uri: `/projects/test-project/datasets/staging/schemas/${schema}`,
      }).reply(200, [{}])
    }

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
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(200, {deleted: true})
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.default',
    }).reply(200, {deleted: true})

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
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('successfully deletes multiple schemas', async () => {
    for (const schema of mockSchemas) {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'delete',
        uri: `/projects/test-project/datasets/production/schemas/${schema}`,
      }).reply(200, {deleted: true})
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'delete',
        uri: `/projects/test-project/datasets/staging/schemas/${schema}`,
      }).reply(200, {deleted: true})
    }

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
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('filters schemas by dataset when dataset flag is provided', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(200, {deleted: true})

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
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('returns failure when schema is not found', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/test-project/datasets/production/schemas/_.schemas.nonexistent`,
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/test-project/datasets/staging/schemas/_.schemas.nonexistent`,
    }).reply(200, [])

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
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(200, {deleted: true})
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.default',
    }).reply(200, {deleted: true})
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/test-project/datasets/production/schemas/_.schemas.nonexistent`,
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/test-project/datasets/staging/schemas/_.schemas.nonexistent`,
    }).reply(200, [])

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
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(403, {
      error: 'Delete failed',
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.default',
    }).reply(403, {
      error: 'Delete failed',
    })

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
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(403, {
      error: 'Delete failed',
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.default',
    }).reply(403, {
      error: 'Delete failed',
    })

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
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(200, {deleted: true})

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
    expect(mockOutput.error).not.toHaveBeenCalled()
  })
})
