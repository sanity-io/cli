import {ProjectRootNotFoundError} from '@sanity/cli-core'
import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {convertToSystemPath, createTestToken, mockApi, testCommand} from '@sanity/cli-test'
import {unstable_defineMediaLibrary} from '@sanity/workbench-cli'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MEDIA_LIBRARY_API_VERSION} from '../../../services/mediaLibraries.js'
import {MediaPullAspectsCommand} from '../pull-aspects.js'

const mockFsAccess = vi.hoisted(() => vi.fn())
const mockFsMkdir = vi.hoisted(() => vi.fn())
const mockFsWriteFile = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({
  access: mockFsAccess,
  mkdir: mockFsMkdir,
  writeFile: mockFsWriteFile,
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

function mockLibraryList(libraries: Array<{id: string; status?: string}>) {
  mockApi({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    method: 'get',
    query: {organizationId: 'test-org-id'},
    uri: '/media-libraries',
  }).reply(200, {
    data: libraries.map((library) => ({
      id: library.id,
      organizationId: 'test-org-id',
      status: library.status ?? 'active',
    })),
  })
}

function mockAspectQuery(libraryId: string, documents: unknown[]) {
  mockApi({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    method: 'post',
    uri: `/media-libraries/${libraryId}/query`,
  }).reply(200, {result: documents})
}

describe('#media:pull-aspects', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('errors when run outside a project directory', async () => {
    const {error} = await testCommand(MediaPullAspectsCommand, [], {
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
    const {error} = await testCommand(MediaPullAspectsCommand, [], {
      mocks: {...defaultMocks, cliConfig: {api: {projectId: 'some-project'}}},
    })

    expect(error?.message).toContain('must be run inside a Media Library config app')
    expect(error?.message).toContain('sanity init --template media-library-config')
  })

  test('generates field modules and prints the sanity.cli.ts entries', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'test-library-id'}])
    mockAspectQuery('test-library-id', [
      {
        _id: 'caption',
        _type: 'sanity.asset.aspect',
        definition: {name: 'caption', title: 'Caption', type: 'string'},
      },
      {
        _id: 'credit',
        _type: 'sanity.asset.aspect',
        definition: {name: 'credit', title: 'Credit', type: 'string'},
        public: true,
      },
    ])
    mockFsAccess.mockRejectedValue(new Error('ENOENT'))
    mockFsMkdir.mockResolvedValue(undefined)
    mockFsWriteFile.mockResolvedValue(undefined)

    const {stdout} = await testCommand(MediaPullAspectsCommand, [], {mocks: defaultMocks})

    expect(mockFsWriteFile).toHaveBeenCalledTimes(2)
    expect(mockFsWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/src/fields/caption.ts'),
      expect.stringContaining(`export default defineField({`),
    )
    expect(stdout).toContain('Generated 2 field modules')
    expect(stdout).toContain(`{name: 'caption', src: './src/fields/caption.ts', title: 'Caption'},`)
    expect(stdout).toContain(
      `{name: 'credit', src: './src/fields/credit.ts', title: 'Credit', public: true},`,
    )
    expect(stdout).toContain('the config app owns these definitions')
  })

  test('skips fields already declared in the config and existing files', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'test-library-id'}])
    mockAspectQuery('test-library-id', [
      {
        _id: 'caption',
        _type: 'sanity.asset.aspect',
        definition: {name: 'caption', title: 'Caption', type: 'string'},
      },
      {
        _id: 'notes',
        _type: 'sanity.asset.aspect',
        definition: {name: 'notes', title: 'Notes', type: 'text'},
      },
    ])
    // Every path exists on disk.
    mockFsAccess.mockResolvedValue(undefined)

    const {stderr, stdout} = await testCommand(MediaPullAspectsCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          app: unstable_defineMediaLibrary({
            fields: [{name: 'caption', src: './src/fields/caption.tsx', title: 'Caption'}],
            organizationId: 'test-org-id',
          }),
        },
      },
    })

    expect(mockFsWriteFile).not.toHaveBeenCalled()
    expect(stderr).toContain('Skipped 2 aspects')
    expect(stderr).toContain('Already declared in sanity.cli.ts')
    expect(stderr).toContain('A file already exists')
    expect(stdout).toContain('No field modules generated.')
  })

  test('rejects a --media-library-id that is not an active library of the organization', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'other-library'}])

    const {error} = await testCommand(
      MediaPullAspectsCommand,
      ['--media-library-id', 'wrong-library'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain('wrong-library is not an active library')
    expect(error?.message).toContain('other-library')
  })

  test('requires --media-library-id unattended when several libraries are active', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'library-one'}, {id: 'library-two'}])

    const {error} = await testCommand(MediaPullAspectsCommand, [], {
      mocks: {...defaultMocks, isInteractive: false},
    })

    expect(error?.message).toContain('2 active media libraries')
    expect(error?.message).toContain('--media-library-id')
  })

  test('reports an empty library without writing anything', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'test-library-id'}])
    mockAspectQuery('test-library-id', [])

    const {stdout} = await testCommand(MediaPullAspectsCommand, [], {mocks: defaultMocks})

    expect(mockFsWriteFile).not.toHaveBeenCalled()
    expect(stdout).toContain('no stored aspects')
  })
})
