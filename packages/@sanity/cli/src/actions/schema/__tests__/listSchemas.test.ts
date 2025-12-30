import {mockApi} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {SCHEMA_API_VERSION} from '../../../services/schemas'
import {listSchemas} from '../listSchemas'
import {type SchemaStoreContext} from '../schemaStoreTypes'

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

describe('#listSchema', () => {
  let context: SchemaStoreContext
  beforeEach(() => {
    vi.clearAllMocks()

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
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, {
      _createdAt: '2025-01-21T18:49:44Z',
      _id: '_.schemas.default',
      workspace: mockManifest.workspaces[0],
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, {
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    const result = await listSchemas(
      {
        'extract-manifest': true,
        id: undefined,
        json: false,
        'manifest-dir': './dist/static',
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
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.staging',
    }).reply(200, {
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    const result = await listSchemas(
      {
        'extract-manifest': true,
        id: '_.schemas.staging',
        json: false,
        'manifest-dir': './dist/static',
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
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, {
      _createdAt: '2025-01-21T18:49:44Z',
      _id: '_.schemas.default',
      workspace: mockManifest.workspaces[0],
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, {
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    const result = await listSchemas(
      {
        'extract-manifest': true,
        id: undefined,
        json: true,
        'manifest-dir': './dist/static',
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
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.staging',
    }).reply(200, {
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    const result = await listSchemas(
      {
        'extract-manifest': true,
        id: '_.schemas.staging',
        json: true,
        'manifest-dir': './dist/static',
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
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(404, undefined)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(404, undefined)

    const result = await listSchemas(
      {
        'extract-manifest': true,
        id: undefined,
        json: false,
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalledWith(
      'No schemas found in datasets ["production","staging"]',
    )
  })

  test('throws an error if a specific schema based on id flag is not found', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.staging',
    }).reply(404, undefined)

    const result = await listSchemas(
      {
        'extract-manifest': true,
        id: '_.schemas.staging',
        json: false,
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalledWith(
      'Schema for id "_.schemas.staging" not found in datasets ["production","staging"]',
    )
  })

  test('throws an error if schema request fails', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(403, {
      error: '↳ Failed to fetch schema',
    })

    const result = await listSchemas(
      {
        'extract-manifest': true,
        id: undefined,
        json: false,
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('↳ Failed to fetch schema'),
    )
  })

  test('skips manifest extraction with no-extract-manifest flag', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, {
      _createdAt: '2025-01-21T18:49:44Z',
      _id: '_.schemas.default',
      workspace: mockManifest.workspaces[0],
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, {
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    await listSchemas(
      {
        'extract-manifest': false,
        id: undefined,
        json: false,
        'manifest-dir': './dist/static',
      },
      context,
    )

    expect(mockManifestExtractor).not.toHaveBeenCalled()
  })
})
