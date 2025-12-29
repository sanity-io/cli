import {runCommand} from '@oclif/test'
import {type CliConfig} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {SanityClient} from '@sanity/client'
import {of, throwError} from 'rxjs'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MediaImportCommand} from '../import.js'

const mocks = vi.hoisted(() => ({
  getCliConfig: vi.fn(),
  getMediaLibraries: vi.fn(),
  getProjectCliClient: vi.fn(),
  importer: vi.fn(),
  select: vi.fn(),
  spinner: vi.fn(),
}))

vi.mock('../../../services/mediaLibraries.js', () => ({
  getMediaLibraries: mocks.getMediaLibraries,
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    select: mocks.select,
    spinner: mocks.spinner,
  }
})

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: mocks.getCliConfig,
}))

vi.mock('../../../../../cli-core/src/services/apiClient.js', () => ({
  getProjectCliClient: mocks.getProjectCliClient,
}))

vi.mock('../../../actions/media/importMedia.js', () => ({
  importer: mocks.importer,
}))

const mockGetMediaLibraries = mocks.getMediaLibraries
const mockGetCliConfig = mocks.getCliConfig
const mockGetProjectCliClient = mocks.getProjectCliClient
const mockSelect = mocks.select
const mockSpinner = mocks.spinner

// Setup CLI config
const apiConfig: CliConfig['api'] = {projectId: '1234'}
mockGetCliConfig.mockResolvedValue({api: apiConfig})
mockGetProjectCliClient.mockResolvedValue({} as SanityClient)

describe('#media:import', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should show help text correctly', async () => {
    const {stdout} = await runCommand(['media', 'import', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Import a set of assets to the target media library.

      USAGE
        $ sanity media import SOURCE [--media-library-id <value>]
          [--replace-aspects]

      ARGUMENTS
        SOURCE  Image file or folder to import from

      FLAGS
        --media-library-id=<value>  The id of the target media library
        --replace-aspects           Replace existing aspect data. All versions will be
                                    replaced (e.g. published and draft aspect data)

      DESCRIPTION
        Import a set of assets to the target media library.

      EXAMPLES
        Import all assets from the "products" directory

          $ sanity media import products

        Import all assets from "gallery" archive

          $ sanity media import gallery.tar.gz

        Import all assets from the "products" directory and replace aspects

          $ sanity media import products --replace-aspects

      "
    `)
  })

  test('show console error when no projectId is found', async () => {
    mockGetCliConfig.mockResolvedValueOnce({api: {}})

    const {error} = await testCommand(MediaImportCommand, ['test-source'])

    expect(error?.message).toContain('does not contain a project identifier')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('show console error when getMediaLibraries fails', async () => {
    mockGetMediaLibraries.mockRejectedValue(new Error('API request failed'))

    const {error} = await testCommand(MediaImportCommand, ['test-source'])

    expect(error?.message).toContain('Failed to list media libraries')
    expect(error?.message).toContain('API request failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('show console error when no active media libraries are found', async () => {
    mockGetMediaLibraries.mockResolvedValue([])

    const {error} = await testCommand(MediaImportCommand, ['test-source'])

    expect(error?.message).toContain('No active media libraries found in this project')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('prompt user when there is no media flag', async () => {
    const mediaLibraries = [
      {id: 'test-media-library', organizationId: 'org-1', status: 'active' as const},
      {id: 'another-library', organizationId: 'org-1', status: 'active' as const},
    ]
    mockGetMediaLibraries.mockResolvedValue(mediaLibraries)
    mockSelect.mockResolvedValue('test-media-library')

    await testCommand(MediaImportCommand, ['test-source'])

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select media library:',
      }),
    )
  })

  test('show console error when there is an error selecting a media library', async () => {
    const mediaLibraries = [
      {id: 'test-media-library', organizationId: 'org-1', status: 'active' as const},
    ]
    mockGetMediaLibraries.mockResolvedValue(mediaLibraries)
    mockSelect.mockRejectedValue(new Error('User cancelled selection'))

    const {error} = await testCommand(MediaImportCommand, ['test-source'])

    expect(error?.message).toContain('Failed to select media library')
    expect(error?.message).toContain('User cancelled selection')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('show console error when the media library id flag is not valid', async () => {
    const mediaLibraries = [
      {id: 'test-media-library', organizationId: 'org-1', status: 'active' as const},
    ]
    mockGetMediaLibraries.mockResolvedValue(mediaLibraries)

    const {error} = await testCommand(MediaImportCommand, [
      'test-source',
      '--media-library-id',
      'non-existent-library',
    ])

    expect(error?.message).toContain('Media library with id "non-existent-library" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('getProjectApiClient is instantiated with the correct values', async () => {
    const mediaLibraries = [
      {id: 'test-media-library', organizationId: 'org-1', status: 'active' as const},
    ]
    mockGetMediaLibraries.mockResolvedValue(mediaLibraries)

    const mockSpinnerInstance = {
      start: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
    }
    mockSpinner.mockReturnValue(mockSpinnerInstance as never)

    await testCommand(MediaImportCommand, [
      'test-source',
      '--media-library-id',
      'test-media-library',
    ])

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: 'v2025-02-19',
      dataset: undefined,
      perspective: 'drafts',
      projectId: '1234',
      requestTagPrefix: 'sanity.mediaLibraryCli.import',
      requireUser: true,
      '~experimental_resource': {
        id: 'test-media-library',
        type: 'media-library',
      },
    })
  })

  test('show success message when cli imports asset successfully', async () => {
    mockGetMediaLibraries.mockResolvedValue([
      {id: 'test-media-library', organizationId: 'org-1', status: 'active' as const},
    ])

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

    await testCommand(MediaImportCommand, [
      'test-source',
      '--media-library-id',
      'test-media-library',
    ])

    expect(mockSpinner).toHaveBeenCalledWith('Beginning import…')
    expect(mockSpinnerInstance.start).toHaveBeenCalled()
    expect(mockSpinnerInstance.succeed).toHaveBeenCalledWith('Imported 3 assets')
  })

  test('show failure in console if importer fails', async () => {
    mockGetMediaLibraries.mockResolvedValue([
      {id: 'test-media-library', organizationId: 'org-1', status: 'active' as const},
    ])

    const mockSpinnerInstance = {
      start: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
    }
    mockSpinner.mockReturnValue(mockSpinnerInstance as never)

    // Mock importer to throw an error
    mocks.importer.mockReturnValue(throwError(() => new Error('Failed to upload asset')))

    const {error} = await testCommand(MediaImportCommand, [
      'test-source',
      '--media-library-id',
      'test-media-library',
    ])

    expect(mockSpinnerInstance.stop).toHaveBeenCalled()
    expect(error).toBeDefined()
    expect(error?.message).toBe('Failed to upload asset')
    expect(error?.oclif?.exit).toBe(1)
  })
})
