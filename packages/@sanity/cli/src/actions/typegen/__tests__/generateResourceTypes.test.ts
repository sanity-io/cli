import path from 'node:path'

import {type TypeGenConfig} from '@sanity/codegen'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  generateResourceTypes,
  type ResolvedResource,
  resolveResourceSchemas,
} from '../generateResourceTypes.js'

const mockFetchResourceSchema = vi.hoisted(() => vi.fn())
const mockRunTypegenGenerate = vi.hoisted(() => vi.fn())
const mockReadFile = vi.hoisted(() => vi.fn())

vi.mock(import('../fetchResourceSchema.js'), () => ({
  fetchResourceSchema: mockFetchResourceSchema,
}))

vi.mock(import('@sanity/codegen'), async (importOriginal) => ({
  ...(await importOriginal()),
  runTypegenGenerate: mockRunTypegenGenerate,
}))

vi.mock(import('node:fs/promises'), async (importOriginal) => ({
  ...(await importOriginal()),
  readFile: mockReadFile,
}))

const remote = {dataset: 'production', generates: './production.ts', projectId: 'abc123'}
const local = {
  dataset: 'staging',
  generates: './staging.ts',
  path: './src/staging/**/*.ts',
  projectId: 'abc123',
  schema: './schema.staging.json',
}
const extractedSchema = [{name: 'book', type: 'document'}]

const config: TypeGenConfig = {
  formatGeneratedCode: true,
  generates: './sanity.types.ts',
  overloadClientMethods: false,
  path: './src/**/*.ts',
  schema: './schema.json',
}

const result = {code: '', duration: 1, queriesCount: 0}

afterEach(() => {
  vi.clearAllMocks()
})

describe('resolveResourceSchemas', () => {
  test('fetches a resource without a schema path and checks a local schema file', async () => {
    mockFetchResourceSchema.mockResolvedValue({schema: extractedSchema, schemaVersion: 'v1'})
    mockReadFile.mockResolvedValue('[]')
    const onResolving = vi.fn()
    const onResolved = vi.fn()

    const resolved = await resolveResourceSchemas({
      onResolved,
      onResolving,
      resources: [remote, local],
      workDir: '/project',
    })

    expect(mockFetchResourceSchema).toHaveBeenCalledExactlyOnceWith(remote)
    expect(mockReadFile).toHaveBeenCalledExactlyOnceWith(
      path.join('/project', 'schema.staging.json'),
      'utf8',
    )
    expect(resolved).toEqual([
      {key: 'abc123.production', resource: remote, schema: extractedSchema, schemaVersion: 'v1'},
      {key: 'abc123.staging', resource: local, schemaPath: './schema.staging.json'},
    ])
    expect(onResolving.mock.calls).toEqual([
      [remote, 'abc123.production'],
      [local, 'abc123.staging'],
    ])
    expect(onResolved.mock.calls).toEqual([[resolved[0]], [resolved[1]]])
  })

  test('names the resource when fetching its schema fails', async () => {
    mockFetchResourceSchema.mockRejectedValue(new Error('No schema is bound'))

    await expect(
      resolveResourceSchemas({resources: [remote], workDir: '/project'}),
    ).rejects.toThrow('Failed to get the schema for "abc123.production": No schema is bound')
  })

  test('reads an absolute schema path as given', async () => {
    mockReadFile.mockResolvedValue('[]')
    const absolute = {...local, schema: path.resolve('/schemas/staging.json')}

    const [entry] = await resolveResourceSchemas({resources: [absolute], workDir: '/project'})

    expect(mockReadFile).toHaveBeenCalledExactlyOnceWith(absolute.schema, 'utf8')
    expect(entry).toEqual({key: 'abc123.staging', resource: absolute, schemaPath: absolute.schema})
  })

  test('names the resource when fetching rejects with a non-error value', async () => {
    mockFetchResourceSchema.mockRejectedValue('offline')

    await expect(
      resolveResourceSchemas({resources: [remote], workDir: '/project'}),
    ).rejects.toThrow('Failed to get the schema for "abc123.production": offline')
  })

  test('fails when a configured schema file is missing', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))

    await expect(resolveResourceSchemas({resources: [local], workDir: '/project'})).rejects.toThrow(
      'Schema file not found for "abc123.staging": ./schema.staging.json',
    )
  })

  test('fails when a configured schema file is not valid JSON', async () => {
    mockReadFile.mockResolvedValue('[{"name": "book"')

    await expect(resolveResourceSchemas({resources: [local], workDir: '/project'})).rejects.toThrow(
      'Schema file for "abc123.staging" is not valid JSON: ./schema.staging.json.',
    )
  })

  test('fails when a configured schema file does not hold an extracted schema', async () => {
    mockReadFile.mockResolvedValue('{"types": []}')

    await expect(resolveResourceSchemas({resources: [local], workDir: '/project'})).rejects.toThrow(
      'Schema file for "abc123.staging" is not an extracted schema: ./schema.staging.json.',
    )
  })

  test('checks a malformed local file before fetching later resources', async () => {
    mockReadFile.mockResolvedValue('not json')

    await expect(
      resolveResourceSchemas({resources: [local, remote], workDir: '/project'}),
    ).rejects.toThrow('is not valid JSON')
    expect(mockFetchResourceSchema).not.toHaveBeenCalled()
  })

  test('stops at the first failure, before later resources are fetched', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    await expect(
      resolveResourceSchemas({resources: [local, remote], workDir: '/project'}),
    ).rejects.toThrow()
    expect(mockFetchResourceSchema).not.toHaveBeenCalled()
  })
})

describe('generateResourceTypes', () => {
  const resolved: ResolvedResource[] = [
    {
      key: 'abc123.production',
      resource: remote,
      schema: extractedSchema as never,
      schemaVersion: 'v1',
    },
    {key: 'abc123.staging', resource: local, schemaPath: './schema.staging.json'},
  ]

  test('generates each resource into its own file under its resource key', async () => {
    mockRunTypegenGenerate.mockResolvedValue(result)
    const onProgress = vi.fn()
    const progressHandler = vi.fn()
    onProgress.mockReturnValue(progressHandler)

    const results = await generateResourceTypes({
      config,
      onProgress,
      resolved,
      workDir: '/project',
    })

    expect(mockRunTypegenGenerate.mock.calls).toEqual([
      [
        {
          config: {...config, generates: './production.ts', path: './src/**/*.ts'},
          extractedSchema,
          onProgress: progressHandler,
          resource: {dataset: 'production', projectId: 'abc123'},
          workDir: '/project',
        },
      ],
      [
        {
          config: {
            ...config,
            generates: './staging.ts',
            path: './src/staging/**/*.ts',
            schema: './schema.staging.json',
          },
          extractedSchema: undefined,
          onProgress: progressHandler,
          resource: {dataset: 'staging', projectId: 'abc123'},
          workDir: '/project',
        },
      ],
    ])
    expect(onProgress.mock.calls).toEqual([[resolved[0]], [resolved[1]]])
    expect(results).toEqual([
      {key: 'abc123.production', result},
      {key: 'abc123.staging', result},
    ])
  })

  test('names the failed resource and the ones already written', async () => {
    mockRunTypegenGenerate
      .mockResolvedValueOnce(result)
      .mockRejectedValueOnce(new Error('Unable to parse query'))

    await expect(generateResourceTypes({config, resolved, workDir: '/project'})).rejects.toThrow(
      'Failed to generate types for "abc123.staging": Unable to parse query\nTypes for "abc123.production" were updated.',
    )
  })

  test('names the failed resource when generation rejects with a non-error value', async () => {
    mockRunTypegenGenerate.mockRejectedValueOnce('worker exited')

    await expect(generateResourceTypes({config, resolved, workDir: '/project'})).rejects.toThrow(
      'Failed to generate types for "abc123.production": worker exited',
    )
  })

  test('does not mention written files when the first resource fails', async () => {
    mockRunTypegenGenerate.mockRejectedValueOnce(new Error('Unable to parse query'))

    const error = await generateResourceTypes({config, resolved, workDir: '/project'}).catch(
      (err: unknown) => err,
    )

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(
      'Failed to generate types for "abc123.production": Unable to parse query',
    )
    expect(mockRunTypegenGenerate).toHaveBeenCalledOnce()
  })
})
