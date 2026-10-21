import {ProjectRootNotFoundError} from '@sanity/cli-core'
import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {convertToSystemPath, createTestToken, mockApi, testCommand} from '@sanity/cli-test'
import {unstable_defineMediaLibrary} from '@sanity/workbench-cli'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MEDIA_LIBRARY_API_VERSION} from '../../../services/mediaLibraries.js'
import {MediaPruneAspectDataCommand} from '../prune-aspect-data.js'

const mockPromptForMediaLibrary = vi.hoisted(() => vi.fn())

vi.mock('../../../prompts/promptForMediaLibrary.js', () => ({
  promptForMediaLibrary: mockPromptForMediaLibrary,
}))

const defaultMocks = {
  cliConfig: {
    app: unstable_defineMediaLibrary({
      fields: [],
      organizationId: 'test-org-id',
    }),
  },
  isInteractive: true,
  projectRoot: {
    directory: convertToSystemPath('/test/project'),
    path: convertToSystemPath('/test/project/sanity.cli.ts'),
    root: convertToSystemPath('/test/project'),
    type: 'studio' as const,
  },
  token: 'test-token',
}

function mockLibraryList(libraries: string[]) {
  mockApi({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    method: 'get',
    query: {organizationId: 'test-org-id'},
    uri: '/media-libraries',
  }).reply(200, {
    data: libraries.map((id) => ({
      id,
      organizationId: 'test-org-id',
      status: 'active',
    })),
  })
}

/**
 * One interceptor per page, consumed in order; the production id-cursor loop
 * only stops on an empty page, so the last page is always `[]`. Both reads
 * carry the prune tag; nock tells them apart by perspective — stored-id query
 * `published`, carrier query `raw`.
 */
function mockIdPages(
  libraryId: string,
  kind: 'carriers' | 'stored',
  pages: string[][],
  capture?: unknown[],
) {
  const query =
    kind === 'stored'
      ? {perspective: 'published', tag: 'sanity.cli.prune-aspect-data'}
      : {perspective: 'raw', tag: 'sanity.cli.prune-aspect-data'}
  for (const page of [...pages, []]) {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      query,
      uri: `/media-libraries/${libraryId}/query`,
    }).reply(200, (_uri, body) => {
      capture?.push(body)
      return {result: page.map((_id) => ({_id}))}
    })
  }
}

function mockMutate(libraryId: string, capture: unknown[]) {
  mockApi({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    method: 'post',
    query: {tag: 'sanity.cli.prune-aspect-data'},
    uri: `/media-libraries/${libraryId}/mutate`,
  }).reply(200, (_uri, body) => {
    capture.push(body)
    return {results: []}
  })
}

describe('#media:prune-aspect-data', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('errors when run outside a project directory', async () => {
    const {error} = await testCommand(MediaPruneAspectDataCommand, ['legacyAspect'], {
      mocks: {
        cliConfigError: new ProjectRootNotFoundError('No project root found'),
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error?.message).toContain('must be run inside a Media Library config app')
    expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
  })

  test('errors when the project is not a Media Library config app', async () => {
    const {error} = await testCommand(MediaPruneAspectDataCommand, ['legacyAspect'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: 'some-project'}},
      },
    })

    expect(error?.message).toContain('must be run inside a Media Library config app')
  })

  test('rejects an invalid aspect name before touching config or network', async () => {
    const {error} = await testCommand(MediaPruneAspectDataCommand, ['not a name'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('"not a name" is not a valid aspect name')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('reports the carriers and changes nothing without --yes', async () => {
    createTestToken('test-token')
    mockLibraryList(['test-library-id'])
    mockIdPages('test-library-id', 'stored', [])
    const carrierQueryBodies: unknown[] = []
    mockIdPages('test-library-id', 'carriers', [['asset-1', 'asset-2']], carrierQueryBodies)
    // No mutate interceptor: a mutation attempt would fail the request and
    // the pending-mocks check.

    const {stdout} = await testCommand(MediaPruneAspectDataCommand, ['legacyAspect'], {
      mocks: defaultMocks,
    })

    // The GROQ that selects what gets pruned, asserted so a filter change
    // cannot slip past these tests unnoticed — including the follow-up
    // request advancing the cursor past the page's last id (a loop that
    // stopped advancing would re-request lastId '' forever).
    expect(carrierQueryBodies).toEqual([
      {
        params: {lastId: ''},
        query:
          '*[_type == "sanity.asset" && defined(aspects["legacyAspect"]) && _id > $lastId]' +
          ' | order(_id) [0...1000]{_id}',
      },
      {
        params: {lastId: 'asset-2'},
        query:
          '*[_type == "sanity.asset" && defined(aspects["legacyAspect"]) && _id > $lastId]' +
          ' | order(_id) [0...1000]{_id}',
      },
    ])

    expect(stdout).toContain('2 documents in media library test-library-id carry')
    expect(stdout).toContain('aspects.legacyAspect')
    expect(stdout).toContain('asset-1')
    expect(stdout).toContain('Re-run with --yes to execute')
  })

  test('reports nothing to prune when no asset carries the aspect', async () => {
    createTestToken('test-token')
    mockLibraryList(['test-library-id'])
    mockIdPages('test-library-id', 'stored', [])
    mockIdPages('test-library-id', 'carriers', [])

    const {stdout} = await testCommand(MediaPruneAspectDataCommand, ['legacyAspect'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('nothing to prune')
  })

  test('warns when the aspect is still declared in the config', async () => {
    createTestToken('test-token')
    mockLibraryList(['test-library-id'])
    mockIdPages('test-library-id', 'stored', [])
    mockIdPages('test-library-id', 'carriers', [['asset-1']])

    const {stderr} = await testCommand(MediaPruneAspectDataCommand, ['caption'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          app: unstable_defineMediaLibrary({
            fields: [
              {
                name: 'caption',
                src: './src/fields/caption.ts',
                title: 'Caption',
              },
            ],
            organizationId: 'test-org-id',
          }),
        },
      },
    })

    expect(stderr).toContain('still declared in sanity.cli.ts')
    expect(stderr).toContain('will grow back')
  })

  test('warns when the stored definition still exists', async () => {
    createTestToken('test-token')
    mockLibraryList(['test-library-id'])
    mockIdPages('test-library-id', 'stored', [['legacyAspect']])
    mockIdPages('test-library-id', 'carriers', [['asset-1']])

    const {stderr} = await testCommand(MediaPruneAspectDataCommand, ['legacyAspect'], {
      mocks: defaultMocks,
    })

    expect(stderr).toContain('still exists in the library')
    expect(stderr).toContain('only removes data, not the definition')
  })

  test('with --yes, unsets the aspect in batches of 100 per mutate request', async () => {
    createTestToken('test-token')
    const carrierIds = Array.from({length: 150}, (_, index) => `asset-${index}`)
    mockLibraryList(['test-library-id'])
    mockIdPages('test-library-id', 'stored', [])
    mockIdPages('test-library-id', 'carriers', [carrierIds])
    const mutateBodies: unknown[] = []
    mockMutate('test-library-id', mutateBodies)
    mockMutate('test-library-id', mutateBodies)

    const {stdout} = await testCommand(MediaPruneAspectDataCommand, ['legacyAspect', '--yes'], {
      mocks: defaultMocks,
    })

    expect(mutateBodies).toHaveLength(2)
    const [first, second] = mutateBodies as {mutations: unknown[]}[]
    expect(first.mutations).toHaveLength(100)
    expect(second.mutations).toHaveLength(50)
    expect(first.mutations[0]).toEqual({
      patch: {id: 'asset-0', unset: ['aspects.legacyAspect']},
    })
    expect(stdout).toContain('pruned 100/150')
    expect(stdout).toContain('pruned 150/150')
    expect(stdout).toContain('aspects.legacyAspect removed from 150 documents')
  })

  test('a mid-run batch failure reports the progress made and that a re-run is safe', async () => {
    createTestToken('test-token')
    const carrierIds = Array.from({length: 150}, (_, index) => `asset-${index}`)
    mockLibraryList(['test-library-id'])
    mockIdPages('test-library-id', 'stored', [])
    mockIdPages('test-library-id', 'carriers', [carrierIds])
    const mutateBodies: unknown[] = []
    mockMutate('test-library-id', mutateBodies)
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      query: {tag: 'sanity.cli.prune-aspect-data'},
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(500, {message: 'mutation quota exceeded'})

    // Short -y alias, covered here so both spellings stay wired.
    const {error} = await testCommand(MediaPruneAspectDataCommand, ['legacyAspect', '-y'], {
      mocks: defaultMocks,
    })

    expect(mutateBodies).toHaveLength(1)
    expect(error?.message).toContain(
      'Removed aspects.legacyAspect from 100 of 150 documents before a batch failed',
    )
    expect(error?.message).toContain('Re-running the command with --yes is safe')
    expect(error?.message).toContain('only the remaining 50 will be mutated')
  })

  test('exits with the SIGINT code when the library prompt is cancelled', async () => {
    createTestToken('test-token')
    mockLibraryList(['library-one', 'library-two'])
    mockPromptForMediaLibrary.mockRejectedValue(
      Object.assign(new Error('SIGINT'), {name: 'ExitPromptError'}),
    )

    const {error, stderr} = await testCommand(MediaPruneAspectDataCommand, ['legacyAspect'], {
      mocks: defaultMocks,
    })

    expect(mockPromptForMediaLibrary).toHaveBeenCalledTimes(1)
    expect(error?.oclif?.exit).toBe(exitCodes.SIGINT)
    expect(stderr).toContain('Aborted by user')
    // The catch-all must not rebrand the cancellation as a prune failure.
    expect(stderr).not.toContain('Failed to prune')
  })

  test('with an explicit --media-library-id not active in the organization, fails clearly', async () => {
    createTestToken('test-token')
    mockLibraryList(['library-a'])

    const {error} = await testCommand(
      MediaPruneAspectDataCommand,
      ['legacyAspect', '--media-library-id', 'library-z'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain('library-z is not an active library')
    expect(error?.message).toContain('library-a')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })
})
