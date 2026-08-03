import {type MessagePort} from 'node:worker_threads'

import * as configMocks from '@sanity/cli-test/mocks/cli-core/config'
import * as taskMocks from '@sanity/cli-test/mocks/cli-core/tasks'
import {type SchemaValidationProblemGroup} from '@sanity/types'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  extractGraphQLAPIs,
  extractGraphQLAPIsWorker,
  type ExtractWorkerData,
  type ExtractWorkerDeps,
} from '../extractGraphQLAPIs.js'
import {ApiSpecification} from '../types.js'

const mockIsMainThread = vi.hoisted(() => vi.fn())
const mockIsSchemaError = vi.hoisted(() => vi.fn())
const mockExtractFromSanitySchema = vi.hoisted(() => vi.fn())
const mockResolveGraphQLApis = vi.hoisted(() => vi.fn())
const mockSchemaError = vi.hoisted(() => class MockSchemaError extends Error {})

vi.mock('node:worker_threads', () => ({
  get isMainThread() {
    return mockIsMainThread()
  },
}))
vi.mock('@sanity/cli-core/config', () => import('@sanity/cli-test/mocks/cli-core/config'))
vi.mock('@sanity/cli-core/tasks', () => import('@sanity/cli-test/mocks/cli-core/tasks'))
vi.mock('../../../util/isSchemaError.js', () => ({
  isSchemaError: mockIsSchemaError,
}))
vi.mock('../extractFromSanitySchema.js', () => ({
  extractFromSanitySchema: mockExtractFromSanitySchema,
}))
vi.mock('../resolveGraphQLApisFromWorkspaces.js', () => ({
  resolveGraphQLApis: mockResolveGraphQLApis,
}))
vi.mock('../SchemaError.js', () => ({
  SchemaError: mockSchemaError,
}))

describe('extractGraphQLAPIs', () => {
  beforeEach(() => {
    configMocks.getCliConfig.mockResolvedValue({
      api: {projectId: 'test-project'},
      graphql: [],
    })
    configMocks.findStudioConfigPath.mockResolvedValue('/path/to/sanity.config.ts')
    taskMocks.studioWorkerTask.mockResolvedValue({})
    mockIsMainThread.mockReturnValue(true)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('throws if not on worker main thread', async () => {
    mockIsMainThread.mockReturnValue(false)
    await expect(extractGraphQLAPIs('/some/work/dir', {})).rejects.toThrow(
      'extractGraphQLAPIs() must be called from the main thread',
    )
  })

  test('calls studioWorkerTask with correct parameters', async () => {
    taskMocks.studioWorkerTask.mockResolvedValue({apis: []})

    await extractGraphQLAPIs('/test/workdir', {
      nonNullDocumentFieldsFlag: true,
      withUnionCache: true,
    })

    expect(taskMocks.studioWorkerTask).toHaveBeenCalledWith(
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
    taskMocks.studioWorkerTask.mockResolvedValue({apis: []})

    await extractGraphQLAPIs('/test/workdir', {})

    const workerData = taskMocks.studioWorkerTask.mock.calls[0][1].workerData
    expect(workerData.nonNullDocumentFieldsFlag).toBeUndefined()
    expect(workerData.withUnionCache).toBeUndefined()
  })

  describe('config errors', () => {
    test('throws SchemaError when worker returns configErrors', async () => {
      const configErrors = [
        {
          path: [{kind: 'type', name: 'badType', type: 'object'}],
          problems: [{message: 'Unknown type: "missing"', severity: 'error'}],
        },
      ]
      taskMocks.studioWorkerTask.mockResolvedValue({apis: [], configErrors})

      const error: unknown = await extractGraphQLAPIs('/test/workdir', {}).catch((err) => err)
      expect(error).toBeInstanceOf(mockSchemaError)
    })

    test('does not throw when configErrors is empty', async () => {
      taskMocks.studioWorkerTask.mockResolvedValue({apis: [], configErrors: []})

      const result = await extractGraphQLAPIs('/test/workdir', {})
      expect(result).toEqual([])
    })
  })
})

// Worker mock and testing utilities
function createMockPort(): MessagePort {
  return {postMessage: vi.fn()} as unknown as MessagePort
}

function createMockDeps(overrides?: Partial<ExtractWorkerDeps>): ExtractWorkerDeps {
  return {
    getStudioWorkspaces: vi.fn().mockResolvedValue([
      {
        dataset: 'production',
        name: 'default',
        projectId: 'test-project',
        schema: {_original: {types: []}},
        unstable_sources: [
          {
            dataset: 'production',
            name: 'default',
            projectId: 'test-project',
            schema: {_original: {types: []}},
          },
        ],
      },
    ]),
    resolveLocalPackage: vi.fn().mockResolvedValue({
      createSchema: vi.fn().mockReturnValue({
        getTypeNames: () => ['document', 'string', 'number'],
      }),
    }),
    ...overrides,
  }
}

/**
 * Returns an error in the shape of those returned by 'internal' Sanity, with .schema._validation
 */
function makeInternalSanitySchemaError(
  message: string,
  validation: SchemaValidationProblemGroup[],
): unknown {
  const err = new Error(message)
  ;(err as unknown as Record<string, unknown>).schema = {_validation: validation}
  return err
}

/**
 * Returns a SchemaError class (revisioned in this project) with .problemGroups
 */
function makeCliLocalSchemaError(
  message: string,
  validation: SchemaValidationProblemGroup[],
): unknown {
  const err = new mockSchemaError(message)
  ;(err as unknown as Record<string, unknown>).problemGroups = validation
  return err
}

function createWorkerData(overrides?: Partial<ExtractWorkerData>): ExtractWorkerData {
  return {
    configPath: '/path/to/sanity.config.ts',
    workDir: '/test/workdir',
    ...overrides,
  }
}

describe('extractGraphQLAPIsWorker', () => {
  beforeEach(() => {
    mockIsSchemaError.mockReturnValue(false)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getStudioWorkspaces error handling', () => {
    test('posts configErrors when getStudioWorkspaces throws schema error with error-severity problems', async () => {
      mockIsSchemaError.mockReturnValue(true)
      const port = createMockPort()
      const configErrors: SchemaValidationProblemGroup[] = [
        {
          path: [{kind: 'type', name: 'badType', type: 'object'}],
          problems: [{message: 'Unknown type', severity: 'error'}],
        },
      ]
      const deps = createMockDeps({
        getStudioWorkspaces: vi
          .fn()
          .mockRejectedValue(makeInternalSanitySchemaError('Schema error', configErrors)),
      })

      await extractGraphQLAPIsWorker(port, createWorkerData(), deps)

      expect(port.postMessage).toHaveBeenCalledWith({
        apis: [],
        configErrors,
      })
    })

    test('filters out warning-severity problems from configErrors', async () => {
      mockIsSchemaError.mockReturnValue(true)
      const port = createMockPort()
      const deps = createMockDeps({
        getStudioWorkspaces: vi.fn().mockRejectedValue(
          makeInternalSanitySchemaError('Schema error', [
            {
              path: [{kind: 'type', name: 'someType', type: 'object'}],
              problems: [
                {message: 'This is a warning', severity: 'warning'},
                {message: 'This is an error', severity: 'error'},
              ],
            },
          ]),
        ),
      })

      await extractGraphQLAPIsWorker(port, createWorkerData(), deps)

      expect(port.postMessage).toHaveBeenCalledWith({
        apis: [],
        configErrors: [
          {
            path: [{kind: 'type', name: 'someType', type: 'object'}],
            problems: [{message: 'This is an error', severity: 'error'}],
          },
        ],
      })
    })

    test('re-throws warning-only schema errors without posting configErrors', async () => {
      mockIsSchemaError.mockReturnValue(true)
      const port = createMockPort()
      const warningOnlyError = makeInternalSanitySchemaError('Warning-only schema', [
        {
          path: [{kind: 'type', name: 'someType', type: 'object'}],
          problems: [{message: 'Just a warning', severity: 'warning'}],
        },
      ])
      const deps = createMockDeps({
        getStudioWorkspaces: vi.fn().mockRejectedValue(warningOnlyError),
      })

      await expect(extractGraphQLAPIsWorker(port, createWorkerData(), deps)).rejects.toBe(
        warningOnlyError,
      )
      expect(port.postMessage).not.toHaveBeenCalled()
    })

    test('re-throws non-schema errors', async () => {
      const port = createMockPort()
      const genericError = new Error('Network failure')
      const deps = createMockDeps({
        getStudioWorkspaces: vi.fn().mockRejectedValue(genericError),
      })

      await expect(extractGraphQLAPIsWorker(port, createWorkerData(), deps)).rejects.toBe(
        genericError,
      )
      expect(port.postMessage).not.toHaveBeenCalled()
    })
  })

  describe('per-API error handling', () => {
    beforeEach(() => {
      mockResolveGraphQLApis.mockReturnValue([
        {
          dataset: 'production',
          projectId: 'test-project',
          schemaTypes: [{name: 'post', type: 'document'}],
          tag: 'default',
        },
      ])
    })

    test('catches SchemaError w/ problemGroups and reports schemaErrors', async () => {
      const port = createMockPort()

      const problemGroups: SchemaValidationProblemGroup[] = [
        {
          path: [{kind: 'type', name: 'post', type: 'document'}],
          problems: [{message: 'Invalid field config', severity: 'error'}],
        },
      ]
      mockExtractFromSanitySchema.mockImplementation(() => {
        throw makeCliLocalSchemaError('Schema errors', problemGroups)
      })

      await extractGraphQLAPIsWorker(port, createWorkerData(), createMockDeps())

      expect(port.postMessage).toHaveBeenCalledWith({
        apis: [
          expect.objectContaining({
            dataset: 'production',
            projectId: 'test-project',
            schemaErrors: problemGroups,
          }),
        ],
      })
    })

    test('catches schema error (via isSchemaError) w/ schema._validation with error-severity problems', async () => {
      const port = createMockPort()
      mockIsSchemaError.mockReturnValue(true)

      const internalSchemaError = makeInternalSanitySchemaError('Internal schema error', [
        {
          path: [{kind: 'type', name: 'post', type: 'document'}],
          problems: [{message: 'Duplicate type name', severity: 'error'}],
        },
      ])
      mockExtractFromSanitySchema.mockImplementation(() => {
        throw internalSchemaError
      })

      await extractGraphQLAPIsWorker(port, createWorkerData(), createMockDeps())

      expect(port.postMessage).toHaveBeenCalledWith({
        apis: [
          expect.objectContaining({
            dataset: 'production',
            schemaErrors: [
              {
                path: [{kind: 'type', name: 'post', type: 'document'}],
                problems: [{message: 'Duplicate type name', severity: 'error'}],
              },
            ],
          }),
        ],
      })
    })

    test('warning-only Sanity internal schema error falls through to extractionError', async () => {
      const port = createMockPort()
      mockIsSchemaError.mockReturnValue(true)

      mockExtractFromSanitySchema.mockImplementation(() => {
        throw makeInternalSanitySchemaError('Warning-only internal schema', [
          {
            path: [{kind: 'type', name: 'post', type: 'document'}],
            problems: [{message: 'Deprecated feature', severity: 'warning'}],
          },
        ])
      })

      await extractGraphQLAPIsWorker(port, createWorkerData(), createMockDeps())

      expect(port.postMessage).toHaveBeenCalledWith({
        apis: [
          expect.objectContaining({
            dataset: 'production',
            extractionError: 'Warning-only internal schema',
          }),
        ],
      })
      // Should NOT have schemaErrors — warnings don't block deployment
      const result = vi.mocked(port.postMessage).mock.calls[0][0]
      expect(result.apis[0].schemaErrors).toBeUndefined()
    })

    test('catches generic errors as extractionError', async () => {
      const port = createMockPort()

      mockExtractFromSanitySchema.mockImplementation(() => {
        throw new Error('Unexpected compilation failure')
      })

      await extractGraphQLAPIsWorker(port, createWorkerData(), createMockDeps())

      expect(port.postMessage).toHaveBeenCalledWith({
        apis: [
          expect.objectContaining({
            dataset: 'production',
            extractionError: 'Unexpected compilation failure',
          }),
        ],
      })
    })

    test('handles non-Error thrown values as extractionError', async () => {
      const port = createMockPort()

      mockExtractFromSanitySchema.mockImplementation(() => {
        throw 'string error'
      })

      await extractGraphQLAPIsWorker(port, createWorkerData(), createMockDeps())

      expect(port.postMessage).toHaveBeenCalledWith({
        apis: [
          expect.objectContaining({
            extractionError: 'string error',
          }),
        ],
      })
    })
  })

  describe('happy path', () => {
    test('posts extracted APIs on success', async () => {
      const port = createMockPort()

      mockResolveGraphQLApis.mockReturnValue([
        {
          dataset: 'production',
          projectId: 'test-project',
          schemaTypes: [{name: 'post', type: 'document'}],
          tag: 'default',
        },
      ])

      const mockExtracted: ApiSpecification = {
        interfaces: [],
        types: [{fields: [], kind: 'Type', name: 'Post', type: 'Object'}],
      }
      mockExtractFromSanitySchema.mockReturnValue(mockExtracted)

      await extractGraphQLAPIsWorker(port, createWorkerData(), createMockDeps())

      expect(port.postMessage).toHaveBeenCalledWith({
        apis: [
          expect.objectContaining({
            dataset: 'production',
            extracted: mockExtracted,
            projectId: 'test-project',
          }),
        ],
      })
    })
  })
})
