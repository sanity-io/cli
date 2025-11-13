import {runCommand} from '@oclif/test'
import {type CliConfig} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MediaImportCommand} from '../import.js'

const mocks = vi.hoisted(() => ({
  getCliConfig: vi.fn(),
  getMediaLibraries: vi.fn(),
  select: vi.fn(),
  spinner: vi.fn(),
}))

vi.mock('../../../services/mediaLibraries.js', () => ({
  getMediaLibraries: mocks.getMediaLibraries,
}))

vi.mock('@inquirer/prompts', () => ({
  select: mocks.select,
  Separator: vi.fn(),
}))

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

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    spinner: mocks.spinner,
  }
})

const mockGetMediaLibraries = mocks.getMediaLibraries
const mockGetCliConfig = mocks.getCliConfig
const mockSelect = mocks.select
const mockSpinner = mocks.spinner

// Setup CLI config
const apiConfig: CliConfig['api'] = {projectId: '1234'}
mockGetCliConfig.mockResolvedValue({api: apiConfig})

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

  test('should show console error when getMediaLibraries fails', async () => {
    mockGetMediaLibraries.mockRejectedValue(new Error('API request failed'))

    const {error} = await testCommand(MediaImportCommand, ['test-source'])

    expect(error?.message).toContain('Failed to list media libraries')
    expect(error?.message).toContain('API request failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should show console error when no active media libraries are found', async () => {
    mockGetMediaLibraries.mockResolvedValue([])

    const {error} = await testCommand(MediaImportCommand, ['test-source'])

    expect(error?.message).toContain('No active media libraries found in this project')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should prompt user when there is no media flag', async () => {
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

  test('should show console error when there is an error selecting a media library', async () => {
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

  test('should show console error when the media library id flag is not valid', async () => {
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

  test('should show spinner when import begins', async () => {
    const mediaLibraries = [
      {id: 'test-media-library', organizationId: 'org-1', status: 'active' as const},
    ]
    mockGetMediaLibraries.mockResolvedValue(mediaLibraries)
    mockSelect.mockResolvedValue('test-media-library')

    const mockSpinnerInstance = {
      fail: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
    }
    mockSpinner.mockReturnValue(mockSpinnerInstance as never)

    const {stdout} = await testCommand(MediaImportCommand, ['test-source'])

    expect(stdout).toContain('Importing to media library:')
    expect(stdout).toContain('test-media-library')
    expect(stdout).toContain('Importing from path:')
    expect(stdout).toContain('test-source')
    expect(mockSpinner).toHaveBeenCalledWith('Beginning import…')
    expect(mockSpinnerInstance.start).toHaveBeenCalled()
  })
})
