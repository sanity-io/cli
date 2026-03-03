import {type MessagePort} from 'node:worker_threads'

import {type SchemaValidationProblemGroup} from '@sanity/types'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {type ExtractWorkerData, type ExtractWorkerDeps} from '../extractGraphQLAPIsWorker.js'
import {SchemaError} from '../SchemaError.js'
import {type ApiSpecification, type ConvertedType, internal} from '../types.js'

// Mock extractFromSanitySchema — the real implementation requires a full compiled Sanity schema
const mockExtractFromSanitySchema = vi.hoisted(() => vi.fn())
vi.mock('../extractFromSanitySchema.js', () => ({
  extractFromSanitySchema: mockExtractFromSanitySchema,
}))

// Mock resolveGraphQLApis to control which APIs are resolved
const mockResolveGraphQLApis = vi.hoisted(() => vi.fn())
vi.mock('../resolveGraphQLApisFromWorkspaces.js', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveGraphQLApis: mockResolveGraphQLApis,
}))

function createMockPort(): MessagePort {
  return {postMessage: vi.fn()} as unknown as MessagePort
}

function createWorkerData(overrides?: Partial<ExtractWorkerData>): ExtractWorkerData {
  return {
    configPath: '/path/to/sanity.config.ts',
    workDir: '/test/workdir',
    ...overrides,
  }
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

function makeSchemaLikeError(
  message: string,
  validation: SchemaValidationProblemGroup[],
): unknown {
  const err = new Error(message)
  ;(err as unknown as Record<string, unknown>).schema = {_validation: validation}
  return err
}

async function loadWorker() {
  const mod = await import('../extractGraphQLAPIsWorker.js')
  return mod.extractGraphQLAPIsWorker
}

function setupSingleApi() {
  mockResolveGraphQLApis.mockReturnValue([
    {
      dataset: 'production',
      projectId: 'test-project',
      schemaTypes: [{name: 'post', type: 'document'}],
      tag: 'default',
    },
  ])
}

describe('extractGraphQLAPIsWorker', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getStudioWorkspaces error handling', () => {
    test('posts configErrors when getStudioWorkspaces throws schema error with error-severity problems', async () => {
      const extractGraphQLAPIsWorker = await loadWorker()
      const port = createMockPort()
      const configErrors: SchemaValidationProblemGroup[] = [
        {
          path: [{kind: 'type', name: 'badType', type: 'object'}],
          problems: [{message: 'Unknown type', severity: 'error'}],
        },
      ]
      const deps = createMockDeps({
        getStudioWorkspaces: vi.fn().mockRejectedValue(
          makeSchemaLikeError('Schema error', configErrors),
        ),
      })

      await extractGraphQLAPIsWorker(port, createWorkerData(), deps)

      expect(port.postMessage).toHaveBeenCalledWith({
        apis: [],
        configErrors,
      })
    })

    test('filters out warning-severity problems from configErrors', async () => {
      const extractGraphQLAPIsWorker = await loadWorker()
      const port = createMockPort()
      const deps = createMockDeps({
        getStudioWorkspaces: vi.fn().mockRejectedValue(
          makeSchemaLikeError('Schema error', [
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
      const extractGraphQLAPIsWorker = await loadWorker()
      const port = createMockPort()
      const warningOnlyError = makeSchemaLikeError('Warning-only schema', [
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
      const extractGraphQLAPIsWorker = await loadWorker()
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
    test('catches SchemaError and reports schemaErrors', async () => {
      const extractGraphQLAPIsWorker = await loadWorker()
      const port = createMockPort()
      setupSingleApi()

      const problemGroups: SchemaValidationProblemGroup[] = [
        {
          path: [{kind: 'type', name: 'post', type: 'document'}],
          problems: [{message: 'Invalid field config', severity: 'error'}],
        },
      ]
      mockExtractFromSanitySchema.mockImplementation(() => {
        throw new SchemaError(problemGroups)
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

    test('catches Sanity internal schema error with error-severity problems', async () => {
      const extractGraphQLAPIsWorker = await loadWorker()
      const port = createMockPort()
      setupSingleApi()

      const internalSchemaError = makeSchemaLikeError('Internal schema error', [
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
      const extractGraphQLAPIsWorker = await loadWorker()
      const port = createMockPort()
      setupSingleApi()

      mockExtractFromSanitySchema.mockImplementation(() => {
        throw makeSchemaLikeError('Warning-only internal schema', [
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
      const extractGraphQLAPIsWorker = await loadWorker()
      const port = createMockPort()
      setupSingleApi()

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
      const extractGraphQLAPIsWorker = await loadWorker()
      const port = createMockPort()
      setupSingleApi()

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

  describe('serializeInternalSymbols', () => {
    test('converts Symbol-keyed [internal] to __internal string key', async () => {
      const {serializeInternalSymbols} = await import('../extractGraphQLAPIsWorker.js')

      const type: ConvertedType = {
        fields: [],
        [internal]: {deprecationReason: 'Use newType instead'},
        kind: 'Type',
        name: 'TestType',
        type: 'Object',
      }
      const extracted: ApiSpecification = {interfaces: [], types: [type]}

      serializeInternalSymbols(extracted)

      const record = type as unknown as Record<string, unknown>
      expect(record.__internal).toEqual({deprecationReason: 'Use newType instead'})
    })

    test('does not add __internal when Symbol key is absent', async () => {
      const {serializeInternalSymbols} = await import('../extractGraphQLAPIsWorker.js')

      const type: ConvertedType = {
        fields: [],
        kind: 'Type',
        name: 'RegularType',
        type: 'Object',
      }
      const extracted: ApiSpecification = {interfaces: [], types: [type]}

      serializeInternalSymbols(extracted)

      const record = type as unknown as Record<string, unknown>
      expect(record.__internal).toBeUndefined()
    })
  })

  describe('happy path', () => {
    test('posts extracted APIs on success', async () => {
      const extractGraphQLAPIsWorker = await loadWorker()
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
