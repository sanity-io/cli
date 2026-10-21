import path from 'node:path'

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
const mockPromptForMediaLibrary = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({
  access: mockFsAccess,
  mkdir: mockFsMkdir,
  writeFile: mockFsWriteFile,
}))
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

function mockAspectQuery(libraryId: string, documents: unknown[], capture?: unknown[]) {
  mockApi({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    method: 'post',
    query: {perspective: 'published'},
    uri: `/media-libraries/${libraryId}/query`,
  }).reply(200, (_uri, body) => {
    capture?.push(body)
    return {result: documents}
  })
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
    const queryBodies: unknown[] = []
    mockAspectQuery(
      'test-library-id',
      [
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
      ],
      queryBodies,
    )
    mockFsAccess.mockRejectedValue(new Error('ENOENT'))
    mockFsMkdir.mockResolvedValue(undefined)
    mockFsWriteFile.mockResolvedValue(undefined)

    const {stdout} = await testCommand(MediaPullAspectsCommand, [], {mocks: defaultMocks})

    // The GROQ that selects what gets pulled, asserted so a filter change
    // cannot slip past these tests unnoticed.
    expect(queryBodies).toEqual([
      {
        params: {type: 'sanity.asset.aspect'},
        query: '*[_type == $type] | order(_id asc)',
      },
    ])

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

  test('generates one module when two stored docs resolve to the same name — the doc whose _id matches wins', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'test-library-id'}])
    mockAspectQuery('test-library-id', [
      // Ordered by _id: the stale legacy doc comes first, and must still lose.
      {
        _id: 'aLegacyCaption',
        _type: 'sanity.asset.aspect',
        definition: {name: 'caption', title: 'Legacy Caption', type: 'string'},
      },
      {
        _id: 'caption',
        _type: 'sanity.asset.aspect',
        definition: {name: 'caption', title: 'Caption', type: 'string'},
      },
    ])
    mockFsAccess.mockRejectedValue(new Error('ENOENT'))
    mockFsMkdir.mockResolvedValue(undefined)
    mockFsWriteFile.mockResolvedValue(undefined)

    const {stderr, stdout} = await testCommand(MediaPullAspectsCommand, [], {mocks: defaultMocks})

    expect(mockFsWriteFile).toHaveBeenCalledTimes(1)
    expect(mockFsWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/src/fields/caption.ts'),
      expect.stringContaining(`title: 'Caption'`),
    )
    expect(stdout).toContain('Generated 1 field module')
    expect(stderr).toContain('aLegacyCaption')
    expect(stderr).toContain('Also defines "caption" — generated from "caption" instead')
  })

  test('detects an existing .tsx module for the same field, not just .ts', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'test-library-id'}])
    mockAspectQuery('test-library-id', [
      {
        _id: 'caption',
        _type: 'sanity.asset.aspect',
        definition: {name: 'caption', title: 'Caption', type: 'string'},
      },
    ])
    // Only the hand-written .tsx variant exists on disk.
    mockFsAccess.mockImplementation((filePath: string) =>
      String(filePath).endsWith('.tsx') ? Promise.resolve() : Promise.reject(new Error('ENOENT')),
    )

    const {stderr, stdout} = await testCommand(MediaPullAspectsCommand, [], {mocks: defaultMocks})

    expect(mockFsWriteFile).not.toHaveBeenCalled()
    expect(stderr).toContain(
      `A file already exists at ${path.join('src', 'fields', 'caption.tsx')}`,
    )
    expect(stdout).toContain('No field modules generated.')
  })

  test('with --overwrite, a declared field is rewritten at its declared src path', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'test-library-id'}])
    mockAspectQuery('test-library-id', [
      {
        _id: 'notes',
        _type: 'sanity.asset.aspect',
        definition: {name: 'notes', title: 'Notes', type: 'text'},
      },
    ])
    mockFsAccess.mockRejectedValue(new Error('ENOENT'))
    mockFsMkdir.mockResolvedValue(undefined)
    mockFsWriteFile.mockResolvedValue(undefined)

    const {stdout} = await testCommand(MediaPullAspectsCommand, ['--overwrite'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          app: unstable_defineMediaLibrary({
            // The declared module lives outside --out-dir and is .tsx; the
            // overwrite must replace it there — not orphan a new
            // src/fields/notes.ts that deploy would never evaluate.
            fields: [{name: 'notes', src: './aspects/notes.tsx', title: 'Notes'}],
            organizationId: 'test-org-id',
          }),
        },
      },
    })

    expect(mockFsWriteFile).toHaveBeenCalledTimes(1)
    expect(mockFsWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/aspects/notes.tsx'),
      expect.stringContaining(`export default defineField({`),
    )
    expect(stdout).toContain('Generated 1 field module')
    expect(stdout).toContain(path.join('aspects', 'notes.tsx'))
    // Already declared, so no "add this to sanity.cli.ts" suggestion.
    expect(stdout).not.toContain(`{name: 'notes'`)
  })

  test('with --overwrite, an extensionless declared src resolves to the module file on disk', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'test-library-id'}])
    mockAspectQuery('test-library-id', [
      {
        _id: 'notes',
        _type: 'sanity.asset.aspect',
        definition: {name: 'notes', title: 'Notes', type: 'text'},
      },
    ])
    // The declared `./aspects/notes` exists on disk as notes.tsx only.
    mockFsAccess.mockImplementation((filePath: string) =>
      String(filePath).endsWith(`${path.sep}notes.tsx`) || String(filePath).endsWith('/notes.tsx')
        ? Promise.resolve()
        : Promise.reject(new Error('ENOENT')),
    )
    mockFsMkdir.mockResolvedValue(undefined)
    mockFsWriteFile.mockResolvedValue(undefined)

    await testCommand(MediaPullAspectsCommand, ['--overwrite'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          app: unstable_defineMediaLibrary({
            // Extensionless src is valid for the bundler and jiti; writing it
            // literally would create a file named `notes` next to notes.tsx.
            fields: [{name: 'notes', src: './aspects/notes', title: 'Notes'}],
            organizationId: 'test-org-id',
          }),
        },
      },
    })

    expect(mockFsWriteFile).toHaveBeenCalledTimes(1)
    expect(mockFsWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/aspects/notes.tsx'),
      expect.stringContaining(`export default defineField({`),
    )
  })

  test('with --overwrite, an undeclared field replaces the existing .tsx file it found', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'test-library-id'}])
    mockAspectQuery('test-library-id', [
      {
        _id: 'caption',
        _type: 'sanity.asset.aspect',
        definition: {name: 'caption', title: 'Caption', type: 'string'},
      },
    ])
    // Only the hand-written .tsx variant exists on disk.
    mockFsAccess.mockImplementation((filePath: string) =>
      String(filePath).endsWith('.tsx') ? Promise.resolve() : Promise.reject(new Error('ENOENT')),
    )
    mockFsMkdir.mockResolvedValue(undefined)
    mockFsWriteFile.mockResolvedValue(undefined)

    const {stdout} = await testCommand(MediaPullAspectsCommand, ['--overwrite'], {
      mocks: defaultMocks,
    })

    expect(mockFsWriteFile).toHaveBeenCalledTimes(1)
    expect(mockFsWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/src/fields/caption.tsx'),
      expect.stringContaining(`export default defineField({`),
    )
    // The suggested config entry points at the file that was written.
    expect(stdout).toContain(
      `{name: 'caption', src: './src/fields/caption.tsx', title: 'Caption'},`,
    )
  })

  test('exits with the SIGINT code when the library prompt is cancelled', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'library-one'}, {id: 'library-two'}])
    mockPromptForMediaLibrary.mockRejectedValue(
      Object.assign(new Error('SIGINT'), {name: 'ExitPromptError'}),
    )

    const {error, stderr} = await testCommand(MediaPullAspectsCommand, [], {mocks: defaultMocks})

    expect(mockPromptForMediaLibrary).toHaveBeenCalledTimes(1)
    expect(error?.oclif?.exit).toBe(exitCodes.SIGINT)
    expect(stderr).toContain('Aborted by user')
    // The catch-all must not rebrand the cancellation as a pull failure.
    expect(stderr).not.toContain('Failed to pull aspects')
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
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('requires --media-library-id unattended when several libraries are active', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'library-one'}, {id: 'library-two'}])

    const {error} = await testCommand(MediaPullAspectsCommand, [], {
      mocks: {...defaultMocks, isInteractive: false},
    })

    expect(error?.message).toContain('2 active media libraries')
    expect(error?.message).toContain('--media-library-id')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('rejects an --out-dir that escapes the project root', async () => {
    const {error} = await testCommand(MediaPullAspectsCommand, ['--out-dir', '../outside'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('--out-dir must stay inside the project root')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('rejects --out-dir .. (the project root parent itself)', async () => {
    const {error} = await testCommand(MediaPullAspectsCommand, ['--out-dir', '..'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('--out-dir must stay inside the project root')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('accepts a directory that merely starts with .. (e.g. ..foo)', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'test-library-id'}])
    mockAspectQuery('test-library-id', [
      {
        _id: 'caption',
        _type: 'sanity.asset.aspect',
        definition: {name: 'caption', title: 'Caption', type: 'string'},
      },
    ])
    mockFsAccess.mockRejectedValue(new Error('ENOENT'))
    mockFsMkdir.mockResolvedValue(undefined)
    mockFsWriteFile.mockResolvedValue(undefined)

    const {error} = await testCommand(MediaPullAspectsCommand, ['--out-dir', '..foo'], {
      mocks: defaultMocks,
    })

    expect(error).toBeUndefined()
    expect(mockFsWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/..foo/caption.ts'),
      expect.stringContaining('export default defineField({'),
    )
  })

  test('an absolute --out-dir inside the root prints clean relative src entries', async () => {
    createTestToken('test-token')
    mockLibraryList([{id: 'test-library-id'}])
    mockAspectQuery('test-library-id', [
      {
        _id: 'caption',
        _type: 'sanity.asset.aspect',
        definition: {name: 'caption', title: 'Caption', type: 'string'},
      },
    ])
    mockFsAccess.mockRejectedValue(new Error('ENOENT'))
    mockFsMkdir.mockResolvedValue(undefined)
    mockFsWriteFile.mockResolvedValue(undefined)

    const {stdout} = await testCommand(
      MediaPullAspectsCommand,
      ['--out-dir', convertToSystemPath('/test/project/custom')],
      {mocks: defaultMocks},
    )

    // The report derives entries from the root-relative path, not the raw flag.
    expect(stdout).toContain(`{name: 'caption', src: './custom/caption.ts', title: 'Caption'},`)
    expect(stdout).not.toContain(`src: './/`)
  })

  test('redacts the local --out-dir path from telemetry', () => {
    expect(MediaPullAspectsCommand.telemetry.redactedFlags).toEqual([
      {canonical: '--out-dir', flags: ['--out-dir']},
    ])
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
