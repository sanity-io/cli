import {afterEach, describe, expect, test, vi} from 'vitest'

import {extractGraphQLAPIs} from '../extractGraphQLAPIs.js'
import {SchemaError} from '../SchemaError.js'
import {type ConvertedType, type ExtractedGraphQLAPI, internal} from '../types.js'

const mockGetCliConfig = vi.hoisted(() => vi.fn())
const mockFindStudioConfigPath = vi.hoisted(() => vi.fn())
const mockStudioWorkerTask = vi.hoisted(() => vi.fn())

vi.mock('node:worker_threads', () => ({
  isMainThread: true,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal()),
  findStudioConfigPath: mockFindStudioConfigPath,
  getCliConfig: mockGetCliConfig,
  studioWorkerTask: mockStudioWorkerTask,
}))

function setupMocks() {
  mockGetCliConfig.mockResolvedValue({
    api: {projectId: 'test-project'},
    graphql: [],
  })
  mockFindStudioConfigPath.mockResolvedValue('/path/to/sanity.config.ts')
}

describe('extractGraphQLAPIs', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('calls studioWorkerTask with correct parameters', async () => {
    setupMocks()
    mockStudioWorkerTask.mockResolvedValue({apis: []})

    await extractGraphQLAPIs('/test/workdir', {
      nonNullDocumentFieldsFlag: true,
      withUnionCache: true,
    })

    expect(mockStudioWorkerTask).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('extractGraphQLAPIs.worker.js'),
      }),
      expect.objectContaining({
        name: 'extractGraphQLAPIs',
        studioRootPath: '/test/workdir',
        workerData: expect.objectContaining({
          configPath: '/path/to/sanity.config.ts',
          nonNullDocumentFieldsFlag: true,
          withUnionCache: true,
          workDir: '/test/workdir',
        }),
      }),
    )
  })

  test('passes undefined options when not specified', async () => {
    setupMocks()
    mockStudioWorkerTask.mockResolvedValue({apis: []})

    await extractGraphQLAPIs('/test/workdir', {})

    const workerData = mockStudioWorkerTask.mock.calls[0][1].workerData
    expect(workerData.nonNullDocumentFieldsFlag).toBeUndefined()
    expect(workerData.withUnionCache).toBeUndefined()
  })

  describe('symbol deserialization', () => {
    test('restores __internal string keys to Symbol-keyed [internal] properties', async () => {
      setupMocks()

      const apis: ExtractedGraphQLAPI[] = [
        {
          dataset: 'production',
          extracted: {
            interfaces: [],
            types: [
              {
                __internal: {deprecationReason: 'Use newType instead'},
                fields: [],
                kind: 'Type',
                name: 'OldType',
                type: 'Object',
              } as unknown as ConvertedType,
            ],
          },
          projectId: 'p1',
        },
      ]
      mockStudioWorkerTask.mockResolvedValue({apis})

      const result = await extractGraphQLAPIs('/test/workdir', {})

      const type = result[0].extracted!.types[0] as ConvertedType
      expect(type[internal]).toEqual({deprecationReason: 'Use newType instead'})
      // __internal string key should be removed
      expect('__internal' in (type as unknown as Record<string, unknown>)).toBe(false)
    })

    test('does not modify types without __internal', async () => {
      setupMocks()

      const apis: ExtractedGraphQLAPI[] = [
        {
          dataset: 'production',
          extracted: {
            interfaces: [],
            types: [
              {
                fields: [],
                kind: 'Type',
                name: 'RegularType',
                type: 'Object',
              } as ConvertedType,
            ],
          },
          projectId: 'p1',
        },
      ]
      mockStudioWorkerTask.mockResolvedValue({apis})

      const result = await extractGraphQLAPIs('/test/workdir', {})

      const type = result[0].extracted!.types[0] as ConvertedType
      expect(type[internal]).toBeUndefined()
    })

    test('skips deserialization for APIs without extracted data', async () => {
      setupMocks()

      const apis: ExtractedGraphQLAPI[] = [
        {
          dataset: 'production',
          extractionError: 'Schema compilation failed',
          projectId: 'p1',
        },
      ]
      mockStudioWorkerTask.mockResolvedValue({apis})

      const result = await extractGraphQLAPIs('/test/workdir', {})

      expect(result[0].extracted).toBeUndefined()
      expect(result[0].extractionError).toBe('Schema compilation failed')
    })
  })

  describe('config errors', () => {
    test('throws SchemaError when worker returns configErrors', async () => {
      setupMocks()

      const configErrors = [
        {
          path: [{kind: 'type', name: 'badType', type: 'object'}],
          problems: [{message: 'Unknown type: "missing"', severity: 'error'}],
        },
      ]
      mockStudioWorkerTask.mockResolvedValue({apis: [], configErrors})

      const error: unknown = await extractGraphQLAPIs('/test/workdir', {}).catch((err) => err)
      expect(error).toBeInstanceOf(SchemaError)
      expect(error).toHaveProperty('message', 'Schema errors encountered')
    })

    test('does not throw when configErrors is empty', async () => {
      setupMocks()

      mockStudioWorkerTask.mockResolvedValue({apis: [], configErrors: []})

      const result = await extractGraphQLAPIs('/test/workdir', {})
      expect(result).toEqual([])
    })
  })
})
