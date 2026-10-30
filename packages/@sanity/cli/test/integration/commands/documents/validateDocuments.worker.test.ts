import {Readable} from 'node:stream'

import {type Rule, type ValidationContext} from '@sanity/types'
import {createSchema} from 'sanity'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  customValidation: vi.fn<(value: unknown, context: ValidationContext) => Promise<true>>(),
  emit: vi.fn(),
  end: vi.fn(),
  getProjectCliClient: vi.fn(),
  getStudioWorkspaces: vi.fn(),
  workerData: {
    clientConfig: {apiVersion: '2025-02-19', useCdn: false},
    level: undefined as 'error' | undefined,
    maxFetchConcurrency: undefined as number | undefined,
    ndjsonFilePath: '/documents.ndjson' as string | undefined,
    workDir: '/studio',
  },
}))

const baseDocuments = [
  {_id: 'author', _type: 'author', name: 'Published author'},
  ...['published-category', 'category-2', 'category-3', 'category-4', 'category-5'].map((_id) => ({
    _id,
    _type: 'category',
  })),
  {_id: 'published-post', _type: 'post', author: {_ref: 'author', _type: 'reference'}},
  {_id: 'drafts.post', _type: 'post', author: {_ref: 'author', _type: 'reference'}},
].map((document) => ({...document, _rev: 'rev1'}))

let documents = baseDocuments

vi.mock('node:worker_threads', () => ({
  isMainThread: false,
  parentPort: {},
  workerData: mocks.workerData,
}))
vi.mock('node:fs', () => ({
  default: {
    createReadStream: () =>
      Readable.from([
        Buffer.from(documents.map((document) => JSON.stringify(document)).join('\n')),
      ]),
    createWriteStream: () => ({close: (callback: () => void) => callback(), write: vi.fn()}),
    promises: {rm: mocks.cleanup},
  },
}))
vi.mock('@sanity/cli-core', () => ({
  getProjectCliClient: mocks.getProjectCliClient,
  getStudioWorkspaces: mocks.getStudioWorkspaces,
  getWorkspace: (workspaces: unknown[]) => workspaces[0],
}))
vi.mock('@sanity/worker-channels', () => ({
  WorkerChannelReporter: {
    from: () => ({
      event: {
        exportFinished: vi.fn(),
        loadedDocumentCount: vi.fn(),
        loadedReferenceIntegrity: vi.fn(),
        loadedWorkspace: vi.fn(),
      },
      stream: {
        exportProgress: {emit: vi.fn(), end: vi.fn()},
        validation: {emit: mocks.emit, end: mocks.end},
      },
    }),
  },
}))

describe('document validation worker', () => {
  beforeEach(() => {
    vi.resetModules()
    documents = baseDocuments
    mocks.customValidation.mockResolvedValue(true)
    mocks.workerData.level = undefined
    mocks.workerData.maxFetchConcurrency = undefined
    mocks.workerData.ndjsonFilePath = '/documents.ndjson'
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    mocks.getStudioWorkspaces.mockResolvedValue([
      {
        basePath: '/',
        dataset: 'production',
        name: 'default',
        projectId: 'test-project',
        schema: createSchema({
          name: 'default',
          types: [
            {fields: [{name: 'name', type: 'string'}], name: 'author', type: 'document'},
            {
              fields: [{name: 'title', type: 'string'}],
              name: 'category',
              type: 'document',
              validation: (rule: Rule) => rule.custom(mocks.customValidation),
            },
            {
              fields: [
                {name: 'author', to: [{type: 'author'}], type: 'reference'},
                {
                  name: 'categories',
                  of: [{to: [{type: 'category'}], type: 'reference'}],
                  type: 'array',
                },
              ],
              name: 'post',
              type: 'document',
            },
          ],
        }),
      },
    ])
    mocks.getProjectCliClient.mockResolvedValue({
      config: () => ({}),
      fetch: async () => documents.length,
      getDataUrl: (_operation: string, ids: string) => ids,
      getUrl: () => 'https://example.test/export',
      request: async ({url}: {url: string}) => ({
        omitted: url.split(',').map((id) => ({id, reason: 'existence'})),
      }),
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(documents.map((document) => JSON.stringify(document)).join('\n')),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  test('shares the fetch limit across documents and reconfigured clients', async () => {
    const gate = Promise.withResolvers<void>()
    let active = 0
    let peak = 0
    mocks.workerData.maxFetchConcurrency = 2
    mocks.customValidation.mockImplementation(async (_value, context) => {
      await context.getClient({apiVersion: '2025-02-19'}).withConfig({useCdn: false}).fetch('*[]')
      return true
    })
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      active++
      peak = Math.max(peak, active)
      await gate.promise
      active--
      return Response.json({ms: 0, result: true})
    })

    const validation = import('../../../../src/actions/documents/validateDocuments.worker.js')
    try {
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    } finally {
      gate.resolve()
      await validation
    }

    expect(fetch).toHaveBeenCalledTimes(documents.filter(({_type}) => _type === 'category').length)
    expect(peak).toBe(2)
    expect(mocks.end).toHaveBeenCalledOnce()
  })

  test('reports incomplete validation even when warnings are filtered out', async () => {
    documents = [...documents, {_id: 'unknown-document', _rev: 'rev1', _type: 'unknown'}]
    mocks.workerData.level = 'error'

    await import('../../../../src/actions/documents/validateDocuments.worker.js')

    const results = mocks.emit.mock.calls.map(([result]) => result)
    expect(results.find((result) => result.documentId === 'unknown-document')).toMatchObject({
      level: 'error',
      markers: [
        {
          level: 'error',
          message:
            'Document validation is incomplete. Check the schema and any reported validation errors, then rerun this command.',
          path: [],
        },
      ],
    })
  })

  test('preserves execution errors without adding a duplicate incomplete-validation error', async () => {
    mocks.customValidation.mockRejectedValue(new Error('Validator unavailable'))

    await import('../../../../src/actions/documents/validateDocuments.worker.js')

    const results = mocks.emit.mock.calls.map(([result]) => result)
    expect(results.find((result) => result.documentId === 'published-category')).toMatchObject({
      level: 'error',
      markers: [
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('Validator unavailable'),
        }),
      ],
    })
  })

  test('reports a timed-out document and continues validating other documents', async () => {
    const signal = AbortSignal.abort(new DOMException('Validation timed out', 'TimeoutError'))
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(new AbortController().signal)
      .mockReturnValueOnce(signal)

    await import('../../../../src/actions/documents/validateDocuments.worker.js')

    expect(timeout).toHaveBeenCalledWith(30_000)
    expect(mocks.emit).toHaveBeenCalledTimes(documents.length)
    const results = mocks.emit.mock.calls.map(([result]) => result)
    expect(results.find((result) => result.documentId === 'author')).toMatchObject({
      level: 'error',
      markers: [
        {
          level: 'error',
          message: 'Exception occurred while validating value: Validation timed out',
          path: [],
        },
      ],
    })
    expect(results.find((result) => result.documentId === 'published-category')).toMatchObject({
      level: 'info',
      markers: [],
    })
    expect(mocks.end).toHaveBeenCalledOnce()
  })

  test.each(['file', 'export'])(
    'validates published references when reading from %s',
    async (source) => {
      mocks.workerData.ndjsonFilePath = source === 'file' ? '/documents.ndjson' : undefined

      await import('../../../../src/actions/documents/validateDocuments.worker.js')

      expect(mocks.emit).toHaveBeenCalledTimes(documents.length)
      for (const [result] of mocks.emit.mock.calls) {
        expect(result.markers).toEqual([])
      }
      expect(mocks.cleanup).toHaveBeenCalledTimes(source === 'export' ? 1 : 0)
    },
  )
})
