import {convertToSystemPath, createTestToken, mockApi} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MEDIA_LIBRARY_API_VERSION} from '../../../../services/mediaLibraries.js'
import {applyAspectSync, planAspectSync} from '../syncAspects.js'

const mockImportModule = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, importModule: mockImportModule}
})

const WORK_DIR = convertToSystemPath('/test/project')

const captionEntry = {name: 'caption', src: './src/fields/caption.ts', title: 'Caption'}
const notesEntry = {name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'}

/** A definition the real schema validator accepts. */
const captionDefinition = {name: 'caption', title: 'Caption', type: 'string'}
/** Valid, but with a function and a component the serializer strips. */
const notesDefinition = {
  components: {input: () => null},
  name: 'notes',
  title: 'Notes',
  type: 'string',
  validation: () => undefined,
}

function mockLibraryList(libraries: string[]) {
  mockApi({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    method: 'get',
    query: {organizationId: 'test-org-id'},
    uri: '/media-libraries',
  }).reply(200, {
    data: libraries.map((id) => ({id, organizationId: 'test-org-id', status: 'active'})),
  })
}

/**
 * The paginated stored-id query: one interceptor per page, consumed in order.
 * The production loop only stops on an empty page, so the last page is `[]`.
 * Pass `capture` to collect the request bodies for flip-check assertions.
 */
function mockStoredIdPages(libraryId: string, pages: string[][], capture?: unknown[]) {
  for (const page of [...pages, []]) {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      query: {perspective: 'published', tag: 'sanity.cli.aspect-sync'},
      uri: `/media-libraries/${libraryId}/query`,
    }).reply(200, (_uri, body) => {
      capture?.push(body)
      return {result: page.map((_id) => ({_id}))}
    })
  }
}

/** The exact stored-id page request, so a filter or cursor change cannot slip past the tests. */
function storedIdQueryBody(lastId: string) {
  return {
    params: {lastId, type: 'sanity.asset.aspect'},
    query: '*[_type == $type && _id > $lastId] | order(_id) [0...1000]{_id}',
  }
}

describe('planAspectSync', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('serializes the fields, resolves the single active library, and diffs stored ids', async () => {
    createTestToken('test-token')
    mockImportModule.mockImplementation((modulePath: string) =>
      modulePath.endsWith('caption.ts') ? captionDefinition : notesDefinition,
    )
    mockLibraryList(['test-library-id'])
    const storedIdBodies: unknown[] = []
    mockStoredIdPages('test-library-id', [['caption', 'legacyAspect']], storedIdBodies)

    const result = await planAspectSync({
      fields: [captionEntry, notesEntry],
      organizationId: 'test-org-id',
      workDir: WORK_DIR,
    })

    if ('failure' in result) throw new Error(`unexpected failure: ${result.failure.message}`)
    expect(result.plan.mediaLibraryId).toBe('test-library-id')
    expect(result.plan.documents).toEqual([
      {_id: 'caption', _type: 'sanity.asset.aspect', definition: captionDefinition},
      {
        _id: 'notes',
        _type: 'sanity.asset.aspect',
        definition: {name: 'notes', title: 'Notes', type: 'string'},
      },
    ])
    expect(result.plan.staleIds).toEqual(['legacyAspect'])
    // Stale ids feed mirror *deletes*, so the selecting GROQ is asserted
    // exactly: dropping the type filter or the cursor must fail here.
    expect(storedIdBodies).toEqual([storedIdQueryBody(''), storedIdQueryBody('legacyAspect')])
    expect(result.plan.strippedByField).toEqual({
      notes: ['definition.components', 'definition.validation'],
    })
    // Field modules are resolved against the project root, not the cwd, and
    // evaluated with JSX enabled so .tsx inputs parse.
    expect(mockImportModule).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/src/fields/caption.ts'),
      {jsx: true},
    )
  })

  test('collects every broken field before failing, without touching the network', async () => {
    mockImportModule.mockImplementation((modulePath: string) => {
      if (modulePath.endsWith('caption.ts')) throw new Error('Unexpected token')
      // notes.tsx evaluates, but its name mismatches the entry.
      return {name: 'somethingElse', title: 'Notes', type: 'string'}
    })

    const result = await planAspectSync({
      fields: [captionEntry, notesEntry],
      organizationId: 'test-org-id',
      workDir: WORK_DIR,
    })

    if ('plan' in result) throw new Error('expected failure')
    expect(result.failure.message).toContain('2 config fields cannot sync')
    expect(result.failure.message).toContain('caption: Unexpected token')
    expect(result.failure.message).toContain('notes: ')
    expect(result.failure.message).toContain('names must match')
  })

  test('fails fields whose serialized definition fails schema validation', async () => {
    // Objects must declare their fields.
    mockImportModule.mockResolvedValue({
      fields: [],
      name: 'caption',
      title: 'Caption',
      type: 'object',
    })

    const result = await planAspectSync({
      fields: [captionEntry],
      organizationId: 'test-org-id',
      workDir: WORK_DIR,
    })

    if ('plan' in result) throw new Error('expected failure')
    expect(result.failure.message).toContain('caption: schema validation failed')
  })

  test('fails when the organization has no active media library', async () => {
    createTestToken('test-token')
    mockImportModule.mockResolvedValue(captionDefinition)
    mockLibraryList([])

    const result = await planAspectSync({
      fields: [captionEntry],
      organizationId: 'test-org-id',
      workDir: WORK_DIR,
    })

    if ('plan' in result) throw new Error('expected failure')
    expect(result.failure.message).toContain('no active media library')
  })

  test('fails when the organization has several active libraries and no explicit target', async () => {
    createTestToken('test-token')
    mockImportModule.mockResolvedValue(captionDefinition)
    mockLibraryList(['library-a', 'library-b'])

    const result = await planAspectSync({
      fields: [captionEntry],
      organizationId: 'test-org-id',
      workDir: WORK_DIR,
    })

    if ('plan' in result) throw new Error('expected failure')
    expect(result.failure.message).toContain('library-a, library-b')
    expect(result.failure.solution).toContain('--media-library-id')
  })

  test('an explicit library id wins when it is an active library of the organization', async () => {
    createTestToken('test-token')
    mockImportModule.mockResolvedValue(captionDefinition)
    mockLibraryList(['library-a', 'library-b'])
    mockStoredIdPages('library-b', [])

    const result = await planAspectSync({
      fields: [captionEntry],
      mediaLibraryId: 'library-b',
      organizationId: 'test-org-id',
      workDir: WORK_DIR,
    })

    if ('failure' in result) throw new Error(`unexpected failure: ${result.failure.message}`)
    expect(result.plan.mediaLibraryId).toBe('library-b')
  })

  test('rejects an explicit library id that is not an active library of the organization', async () => {
    createTestToken('test-token')
    mockImportModule.mockResolvedValue(captionDefinition)
    mockLibraryList(['library-a'])

    const result = await planAspectSync({
      fields: [captionEntry],
      mediaLibraryId: 'library-z',
      organizationId: 'test-org-id',
      workDir: WORK_DIR,
    })

    if ('plan' in result) throw new Error('expected failure')
    expect(result.failure.message).toContain('library-z is not an active library')
    expect(result.failure.message).toContain('library-a')
  })

  test('pages through stored ids until an empty page — a short page is not exhaustion', async () => {
    createTestToken('test-token')
    mockImportModule.mockResolvedValue(captionDefinition)
    mockLibraryList(['test-library-id'])
    // Two short pages: the loop must keep requesting until the empty page.
    const storedIdBodies: unknown[] = []
    mockStoredIdPages('test-library-id', [['aardvark'], ['zebra']], storedIdBodies)

    const result = await planAspectSync({
      fields: [captionEntry],
      organizationId: 'test-org-id',
      workDir: WORK_DIR,
    })

    if ('failure' in result) throw new Error(`unexpected failure: ${result.failure.message}`)
    expect(result.plan.staleIds).toEqual(['aardvark', 'zebra'])
    // Each request advances the cursor past the previous page's last id; a
    // loop that stopped advancing would re-request lastId '' forever.
    expect(storedIdBodies).toEqual([
      storedIdQueryBody(''),
      storedIdQueryBody('aardvark'),
      storedIdQueryBody('zebra'),
    ])
  })
})

describe('applyAspectSync', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('applies the upserts and deletes as one mutation transaction', async () => {
    createTestToken('test-token')
    let requestBody: unknown
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      query: {tag: 'sanity.cli.aspect-sync'},
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(200, (_uri, body) => {
      requestBody = body
      return {results: []}
    })

    const document = {
      _id: 'caption',
      _type: 'sanity.asset.aspect',
      definition: {name: 'caption', title: 'Caption', type: 'string'},
    } as const

    await applyAspectSync({
      documents: [document],
      mediaLibraryId: 'test-library-id',
      staleIds: ['legacyAspect'],
      strippedByField: {},
    })

    expect(requestBody).toEqual({
      mutations: [
        {createOrReplace: document},
        {
          delete: {
            params: {id: 'legacyAspect', type: 'sanity.asset.aspect'},
            query: '*[_type == $type && _id == $id]',
          },
        },
      ],
    })
  })
})
