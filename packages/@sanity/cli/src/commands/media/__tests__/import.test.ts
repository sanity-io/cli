import {type CliConfig} from '@sanity/cli-core'
import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {of, throwError} from 'rxjs'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MEDIA_LIBRARY_API_VERSION} from '../../../services/mediaLibraries.js'
import {MediaImportCommand} from '../import.js'

const mocks = vi.hoisted(() => ({
  importer: vi.fn(),
  ingestMediaAssetFromUrlWithProgress: vi.fn(),
  select: vi.fn(),
  spinner: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    select: mocks.select,
    spinner: mocks.spinner,
  }
})

vi.mock('../../../actions/media/importMedia.js', () => ({
  importer: mocks.importer,
}))

vi.mock('../../../actions/media/ingestMediaAssetFromUrlWithProgress.js', () => ({
  ingestMediaAssetFromUrlWithProgress: mocks.ingestMediaAssetFromUrlWithProgress,
}))

const mockSelect = mocks.select
const mockSpinner = mocks.spinner
const mockIngestFromUrl = mocks.ingestMediaAssetFromUrlWithProgress

const SOURCE_URL = 'https://example.com/hero.png'

/** The single active library the URL tests select. */
function mockLibraries() {
  return mockApi({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    method: 'get',
    query: {projectId: '1234'},
    uri: '/media-libraries',
  }).reply(200, {
    data: [{id: 'test-media-library', organizationId: 'org-1', status: 'active'}],
  })
}

const ingestedAsset = {
  asset: {_id: 'asset-1', _type: 'sanity.asset', assetType: 'sanity.imageAsset'},
  assetInstance: {
    _id: 'image-1',
    extension: 'png',
    mimeType: 'image/png',
    originalFilename: 'hero.png',
    size: 1024,
    url: 'https://cdn.sanity.io/media-libraries/lib/images/hero.png',
  },
}

const defaultMocks = {
  cliConfig: {
    api: {projectId: '1234'} as CliConfig['api'],
  },
  isInteractive: true,
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    root: '/test/path',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#media:import', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('show console error when getMediaLibraries fails', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: '1234'},
      uri: '/media-libraries',
    }).reply(500, {error: 'API request failed'})

    const {error} = await testCommand(MediaImportCommand, ['test-source'], {mocks: defaultMocks})

    expect(error?.message).toContain('Failed to list media libraries')
    expect(error?.message).toContain('API request failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('show console error when no active media libraries are found', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: '1234'},
      uri: '/media-libraries',
    }).reply(200, {data: []})

    const {error} = await testCommand(MediaImportCommand, ['test-source'], {mocks: defaultMocks})

    expect(error?.message).toContain('No active media libraries found in this project')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('prompt user when there is no media flag', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: '1234'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })
    mockSelect.mockResolvedValue('test-media-library')

    await testCommand(MediaImportCommand, ['test-source'], {mocks: defaultMocks})

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select media library:',
      }),
    )
  })

  test('show console error when there is an error selecting a media library', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: '1234'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [{id: 'test-media-library', organizationId: 'org-1', status: 'active'}],
    })
    mockSelect.mockRejectedValue(new Error('User cancelled selection'))

    const {error} = await testCommand(MediaImportCommand, ['test-source'], {mocks: defaultMocks})

    expect(error?.message).toContain('Failed to select media library')
    expect(error?.message).toContain('User cancelled selection')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('requires a media library ID in unattended mode', async () => {
    const {error} = await testCommand(MediaImportCommand, ['test-source'], {
      mocks: {...defaultMocks, isInteractive: false},
    })

    expect(error?.message).toContain('Missing required flag media-library-id')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  test('show console error when the media library id flag is not valid', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: '1234'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [{id: 'test-media-library', organizationId: 'org-1', status: 'active'}],
    })

    const {error} = await testCommand(
      MediaImportCommand,
      ['test-source', '--media-library-id', 'non-existent-library'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain('Media library with id "non-existent-library" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('getProjectApiClient is instantiated with the correct values', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: '1234'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [{id: 'test-media-library', organizationId: 'org-1', status: 'active'}],
    })

    const mockSpinnerInstance = {
      start: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
    }
    mockSpinner.mockReturnValue(mockSpinnerInstance as never)

    await testCommand(
      MediaImportCommand,
      ['test-source', '--media-library-id', 'test-media-library'],
      {mocks: defaultMocks},
    )

    expect(mockSpinnerInstance.start).toHaveBeenCalled()
  })

  test('show success message when cli imports asset successfully', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: '1234'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [{id: 'test-media-library', organizationId: 'org-1', status: 'active'}],
    })

    const mockSpinnerInstance = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      text: '',
    }
    mockSpinner.mockReturnValue(mockSpinnerInstance as never)

    // Mock importer to emit 3 assets
    mocks.importer.mockReturnValue(
      of(
        {asset: {originalFilename: 'img1.jpg'}, fileCount: 3},
        {asset: {originalFilename: 'img2.jpg'}, fileCount: 3},
        {asset: {originalFilename: 'img3.jpg'}, fileCount: 3},
      ),
    )

    await testCommand(
      MediaImportCommand,
      ['test-source', '--media-library-id', 'test-media-library'],
      {mocks: defaultMocks},
    )

    expect(mockSpinner).toHaveBeenCalledWith('Beginning import…')
    expect(mockSpinnerInstance.start).toHaveBeenCalled()
    expect(mockSpinnerInstance.succeed).toHaveBeenCalledWith('Imported 3 assets')
  })

  test('show failure in console if importer fails', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: '1234'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [{id: 'test-media-library', organizationId: 'org-1', status: 'active'}],
    })

    const mockSpinnerInstance = {
      start: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
    }
    mockSpinner.mockReturnValue(mockSpinnerInstance as never)

    // Mock importer to throw an error
    mocks.importer.mockReturnValue(throwError(() => new Error('Failed to upload asset')))

    const {error} = await testCommand(
      MediaImportCommand,
      ['test-source', '--media-library-id', 'test-media-library'],
      {mocks: defaultMocks},
    )

    expect(mockSpinnerInstance.stop).toHaveBeenCalled()
    expect(error).toBeDefined()
    expect(error?.message).toBe('Failed to upload asset')
    expect(error?.oclif?.exit).toBe(1)
  })

  describe('with a URL source', () => {
    test('ingests the asset and prints the resulting documents as JSON', async () => {
      mockLibraries()
      mockIngestFromUrl.mockResolvedValue(ingestedAsset)

      const {error, stdout} = await testCommand(
        MediaImportCommand,
        [SOURCE_URL, '--media-library-id', 'test-media-library'],
        {mocks: defaultMocks},
      )

      expect(error).toBeUndefined()
      expect(mockIngestFromUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaLibraryId: 'test-media-library',
          url: SOURCE_URL,
        }),
      )
      expect(JSON.parse(stdout)).toEqual({
        asset: {_id: 'asset-1', _type: 'sanity.asset', assetType: 'sanity.imageAsset'},
        assetInstance: {
          _id: 'image-1',
          extension: 'png',
          mimeType: 'image/png',
          originalFilename: 'hero.png',
          size: 1024,
          url: 'https://cdn.sanity.io/media-libraries/lib/images/hero.png',
        },
      })
      // The directory pipeline must not run for a URL source
      expect(mocks.importer).not.toHaveBeenCalled()
    })

    test('does not write the banner to stdout, keeping the output parseable', async () => {
      mockLibraries()
      mockIngestFromUrl.mockResolvedValue(ingestedAsset)

      const {stdout} = await testCommand(
        MediaImportCommand,
        [SOURCE_URL, '--media-library-id', 'test-media-library'],
        {mocks: defaultMocks},
      )

      expect(stdout).not.toContain('Importing to media library')
      expect(() => JSON.parse(stdout)).not.toThrow()
    })

    test('passes aspects and filename through to the ingest', async () => {
      mockLibraries()
      mockIngestFromUrl.mockResolvedValue(ingestedAsset)

      await testCommand(
        MediaImportCommand,
        [
          SOURCE_URL,
          '--media-library-id',
          'test-media-library',
          '--aspect',
          'department=Brand',
          '--aspect',
          'campaign=Spring',
          '--filename',
          'brand-hero.png',
        ],
        {mocks: defaultMocks},
      )

      expect(mockIngestFromUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          aspects: {campaign: 'Spring', department: 'Brand'},
          filename: 'brand-hero.png',
        }),
      )
    })

    test('omits aspects entirely when none are passed', async () => {
      mockLibraries()
      mockIngestFromUrl.mockResolvedValue(ingestedAsset)

      await testCommand(
        MediaImportCommand,
        [SOURCE_URL, '--media-library-id', 'test-media-library'],
        {mocks: defaultMocks},
      )

      const [options] = mockIngestFromUrl.mock.calls[0]
      expect(options).not.toHaveProperty('aspects')
      expect(options).not.toHaveProperty('filename')
    })

    test('rejects credentials in the source URL before any request', async () => {
      const {error} = await testCommand(
        MediaImportCommand,
        ['https://user:pass@example.com/hero.png', '--media-library-id', 'test-media-library'],
        {mocks: defaultMocks},
      )

      expect(error?.message).toContain('must not contain a username or password')
      expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
      expect(mockIngestFromUrl).not.toHaveBeenCalled()
    })

    test('rejects a --filename holding a path before any request', async () => {
      const {error} = await testCommand(
        MediaImportCommand,
        [SOURCE_URL, '--media-library-id', 'test-media-library', '--filename', 'media/hero.png'],
        {mocks: defaultMocks},
      )

      expect(error?.message).toContain('must not contain path separators or null bytes')
      expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
      expect(mockIngestFromUrl).not.toHaveBeenCalled()
    })

    test('reports a failed ingest with media library guidance', async () => {
      mockLibraries()
      mockIngestFromUrl.mockRejectedValue(
        Object.assign(new Error('Could not fetch source'), {
          response: {
            body: {error: 'Bad Gateway', message: 'Could not fetch source', statusCode: 502},
            headers: {},
            method: 'POST',
            statusCode: 502,
            statusMessage: 'Bad Gateway',
            url: 'https://api.sanity.io/v2025-02-19/media-libraries/test-media-library/from-url',
          },
          statusCode: 502,
        }),
      )

      const {error} = await testCommand(
        MediaImportCommand,
        [SOURCE_URL, '--media-library-id', 'test-media-library'],
        {mocks: defaultMocks},
      )

      expect(error?.message).toContain('Sanity could not fetch the source URL')
      expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
    })

    test('lets the base command handle SIGINT rather than reporting an upload failure', async () => {
      mockLibraries()
      mockIngestFromUrl.mockRejectedValue(new Error('SIGINT'))

      const {error, stderr} = await testCommand(
        MediaImportCommand,
        [SOURCE_URL, '--media-library-id', 'test-media-library'],
        {mocks: defaultMocks},
      )

      expect(error?.oclif?.exit).toBe(exitCodes.SIGINT)
      expect(stderr).toContain('Aborted by user')
      expect(stderr).not.toContain('Asset upload failed')
    })

    test('still validates the media library id', async () => {
      mockLibraries()

      const {error} = await testCommand(
        MediaImportCommand,
        [SOURCE_URL, '--media-library-id', 'non-existent-library'],
        {mocks: defaultMocks},
      )

      expect(error?.message).toContain('Media library with id "non-existent-library" not found')
      expect(mockIngestFromUrl).not.toHaveBeenCalled()
    })

    test('rejects --replace-aspects, which has no meaning for a single asset', async () => {
      const {error} = await testCommand(
        MediaImportCommand,
        [SOURCE_URL, '--media-library-id', 'test-media-library', '--replace-aspects'],
        {mocks: defaultMocks},
      )

      expect(error?.message).toContain('--replace-aspects flag only applies to directory')
      expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
      expect(mockIngestFromUrl).not.toHaveBeenCalled()
    })

    test('reports a malformed --aspect before contacting the API', async () => {
      const {error} = await testCommand(
        MediaImportCommand,
        [SOURCE_URL, '--media-library-id', 'test-media-library', '--aspect', 'department'],
        {mocks: defaultMocks},
      )

      expect(error?.message).toContain('Invalid --aspect "department": expected key=value format')
      expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
      expect(mockIngestFromUrl).not.toHaveBeenCalled()
    })
  })

  describe('with a local source', () => {
    test('rejects --aspect, which only applies to URL sources', async () => {
      const {error} = await testCommand(
        MediaImportCommand,
        ['products', '--media-library-id', 'test-media-library', '--aspect', 'department=Brand'],
        {mocks: defaultMocks},
      )

      expect(error?.message).toContain('--aspect flag only applies when importing from a URL')
      expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
      expect(mockIngestFromUrl).not.toHaveBeenCalled()
    })

    test('rejects --filename, which only applies to URL sources', async () => {
      const {error} = await testCommand(
        MediaImportCommand,
        ['products', '--media-library-id', 'test-media-library', '--filename', 'hero.png'],
        {mocks: defaultMocks},
      )

      expect(error?.message).toContain('--filename flag only applies when importing from a URL')
      expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    })

    test('does not take the URL path for a directory that looks like a host', async () => {
      mockLibraries()

      const mockSpinnerInstance = {
        start: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
        text: '',
      }
      mockSpinner.mockReturnValue(mockSpinnerInstance as never)
      mocks.importer.mockReturnValue(of({asset: {originalFilename: 'a.jpg'}, fileCount: 1}))

      await testCommand(
        MediaImportCommand,
        ['example.com', '--media-library-id', 'test-media-library'],
        {mocks: defaultMocks},
      )

      expect(mocks.importer).toHaveBeenCalled()
      expect(mockIngestFromUrl).not.toHaveBeenCalled()
    })
  })
})
