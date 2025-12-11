import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {listSchemas} from '../listSchemas'
import {type SchemaStoreContext} from '../schemaStoreTypes'

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

describe('#listSchema', () => {
  let context: SchemaStoreContext
  let mockClientWithConfig: {
    config: ReturnType<typeof vi.fn>
    request: ReturnType<typeof vi.fn>
    withConfig: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockClientWithConfig = {
      config: vi.fn().mockReturnValue({dataset: 'production', projectId: 'test-project'}),
      request: vi.fn(),
      withConfig: vi.fn(),
    }

    mockClientWithConfig.withConfig.mockReturnValue(mockClientWithConfig)

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

  test('should list schemas', async () => {
    mockClientWithConfig.request
      .mockResolvedValueOnce({
        _createdAt: '2025-01-21T18:49:44Z',
        _id: '_.schemas.default',
        workspace: mockManifest.workspaces[0],
      })
      .mockResolvedValueOnce({
        _createdAt: '2025-05-28T18:49:44Z',
        _id: '_.schemas.staging',
        workspace: mockManifest.workspaces[1],
      })

    const result = await listSchemas(
      {
        id: undefined,
        json: false,
        'manifest-dir': './dist/static',
        'no-extract-manifest': false,
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.log).toHaveBeenCalledWith(
      'Id                  Workspace   Dataset      ProjectId      CreatedAt           ',
    )
    expect(mockOutput.log).toHaveBeenCalledWith(
      '_.schemas.staging   staging     staging      test-project   2025-05-28T18:49:44Z',
    )
    expect(mockOutput.log).toHaveBeenCalledWith(
      '_.schemas.default   default     production   test-project   2025-01-21T18:49:44Z',
    )
  })

  test('should list a specific schema based on id flag', async () => {
    mockClientWithConfig.request.mockResolvedValueOnce({
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    const result = await listSchemas(
      {
        id: '_.schemas.staging',
        json: false,
        'manifest-dir': './dist/static',
        'no-extract-manifest': false,
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.log).toHaveBeenCalledWith(
      'Id                  Workspace   Dataset   ProjectId      CreatedAt           ',
    )
    expect(mockOutput.log).toHaveBeenCalledWith(
      '_.schemas.staging   staging     staging   test-project   2025-05-28T18:49:44Z',
    )
  })

  test('should list schemas in json', async () => {
    mockClientWithConfig.request
      .mockResolvedValueOnce({
        _createdAt: '2025-01-21T18:49:44Z',
        _id: '_.schemas.default',
        workspace: mockManifest.workspaces[0],
      })
      .mockResolvedValueOnce({
        _createdAt: '2025-05-28T18:49:44Z',
        _id: '_.schemas.staging',
        workspace: mockManifest.workspaces[1],
      })

    const result = await listSchemas(
      {
        id: undefined,
        json: true,
        'manifest-dir': './dist/static',
        'no-extract-manifest': false,
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.log).toHaveBeenCalledWith(
      // eslint-disable-next-line no-useless-escape
      expect.stringContaining(`\"_id\": \"_.schemas.default\"`),
    )
  })

  test('should list a specific schema based on id flag in json', async () => {
    mockClientWithConfig.request.mockResolvedValueOnce({
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    const result = await listSchemas(
      {
        id: '_.schemas.staging',
        json: true,
        'manifest-dir': './dist/static',
        'no-extract-manifest': false,
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.log).toHaveBeenCalledWith(
      // eslint-disable-next-line no-useless-escape
      expect.stringContaining(`\"_id\": \"_.schemas.staging\"`),
    )
  })

  test('throws an error if no schemas are found', async () => {
    mockClientWithConfig.request.mockResolvedValueOnce(undefined)

    const result = await listSchemas(
      {
        id: undefined,
        json: false,
        'manifest-dir': './dist/static',
        'no-extract-manifest': false,
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalledWith(
      'No schemas found in datasets ["production","staging"]',
    )
  })

  test('throws an error if a specific schema based on id flag is not found', async () => {
    mockClientWithConfig.request.mockResolvedValueOnce(undefined)

    const result = await listSchemas(
      {
        id: '_.schemas.staging',
        json: false,
        'manifest-dir': './dist/static',
        'no-extract-manifest': false,
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalledWith(
      'Schema for id "_.schemas.staging" not found in datasets ["production","staging"]',
    )
  })

  test('throws an error if schema request fails', async () => {
    interface ErrorUnauthorized extends Error {
      statusCode: 401
    }
    const error = new Error('Error') as ErrorUnauthorized
    error.statusCode = 401
    mockClientWithConfig.request.mockRejectedValue(error)

    const result = await listSchemas(
      {
        id: undefined,
        json: false,
        'manifest-dir': './dist/static',
        'no-extract-manifest': false,
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.warn).toHaveBeenCalledWith(
      // eslint-disable-next-line no-useless-escape
      expect.stringContaining(`↳ No permissions to read schema from \"production\"`),
    )
  })

  test('skips manifest extraction with no-extract-manifest flag', async () => {
    mockClientWithConfig.request.mockResolvedValueOnce({
      _createdAt: '2025-01-21T18:49:44Z',
      _id: '_.schemas.default',
      workspace: mockManifest.workspaces[0],
    })

    await listSchemas(
      {
        id: undefined,
        json: false,
        'manifest-dir': './dist/static',
        'no-extract-manifest': true,
      },
      context,
    )

    expect(mockManifestExtractor).not.toHaveBeenCalled()
  })
})
