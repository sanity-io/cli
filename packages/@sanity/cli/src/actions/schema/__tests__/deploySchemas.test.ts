import {mockApi} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {SCHEMA_API_VERSION} from '../../../services/schemas'
import {deploySchemas} from '../deploySchemas'
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

describe('#deploySchemas', () => {
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
      if (filePath.includes('create-schema.json')) {
        return {
          lastModified: '2024-01-01T00:00:00.000Z',
          parsedJson: [{fields: [{name: 'title', type: 'string'}], name: 'post', type: 'document'}],
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

  test('should deploy schemas', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, undefined)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, undefined)

    const result = await deploySchemas(
      {
        'extract-manifest': true,
        json: undefined,
        'manifest-dir': './dist/static',
        tag: undefined,
        verbose: false,
        workspace: undefined,
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.log).toHaveBeenCalledWith('Deployed 2/2 schemas')
    expect(mockOutput.log).toHaveBeenCalledWith('↳ List deployed schemas with: sanity schema list')
  })

  test('throw an error if some schemas fail to deploy', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, undefined)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(404, undefined)

    const result = await deploySchemas(
      {
        'extract-manifest': true,
        json: undefined,
        'manifest-dir': './dist/static',
        tag: undefined,
        verbose: false,
        workspace: undefined,
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to deploy 1/2 schemas. Successfully deployed 1/2 schemas.'),
    )
    expect(mockOutput.log).toHaveBeenCalledWith('↳ List deployed schemas with: sanity schema list')
  })

  test('should deploy a specific schema based on workspace flag', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, undefined)

    const result = await deploySchemas(
      {
        'extract-manifest': true,
        json: undefined,
        'manifest-dir': './dist/static',
        tag: undefined,
        verbose: false,
        workspace: 'default',
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.log).toHaveBeenCalledWith('Deployed 1/1 schemas')
    expect(mockOutput.log).toHaveBeenCalledWith('↳ List deployed schemas with: sanity schema list')
  })

  test('throws an error if workspace is not found', async () => {
    const result = await deploySchemas(
      {
        'extract-manifest': true,
        json: undefined,
        'manifest-dir': './dist/static',
        tag: undefined,
        verbose: false,
        workspace: 'test',
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('Found no workspaces named "test"'),
    )
  })

  test('should enable verbose logging with verbose flag', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, undefined)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, undefined)

    const result = await deploySchemas(
      {
        'extract-manifest': true,
        json: undefined,
        'manifest-dir': './dist/static',
        tag: undefined,
        verbose: true,
        workspace: undefined,
      },
      context,
    )

    expect(result).toBe('success')
    expect(mockOutput.log).toHaveBeenCalledWith(
      '↳ schemaId: _.schemas.default, projectId: test-project, dataset: production',
    )
  })

  test('should throw an error if tag is invalid', async () => {
    await expect(() =>
      deploySchemas(
        {
          'extract-manifest': true,
          json: undefined,
          'manifest-dir': './dist/static',
          tag: 'test.tag',
          verbose: false,
          workspace: undefined,
        },
        context,
      ),
    ).rejects.toThrowError('tag cannot contain . (period)')
  })

  test('throws an error if schema request fails', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(401, undefined)

    const result = await deploySchemas(
      {
        'extract-manifest': false,
        json: undefined,
        'manifest-dir': './dist/static',
        tag: undefined,
        verbose: false,
        workspace: undefined,
      },
      context,
    )

    expect(result).toBe('failure')
    expect(mockOutput.error).toHaveBeenCalledWith(
      expect.stringContaining(
        `↳ No permissions to write schema for workspace "default" in dataset "production"`,
      ),
    )
  })

  test('skips manifest extraction with no-extract-manifest flag', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, undefined)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, undefined)

    await deploySchemas(
      {
        'extract-manifest': false,
        json: undefined,
        'manifest-dir': './dist/static',
        tag: undefined,
        verbose: false,
        workspace: undefined,
      },
      context,
    )

    expect(mockManifestExtractor).not.toHaveBeenCalled()
  })
})
