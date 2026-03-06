import {type CliConfig, ProjectRootNotFoundError} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {of, throwError} from 'rxjs'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MEDIA_LIBRARY_API_VERSION} from '../../../services/mediaLibraries.js'
import {MediaImportCommand} from '../import.js'

const mocks = vi.hoisted(() => ({
  importer: vi.fn(),
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

const mockSelect = mocks.select
const mockSpinner = mocks.spinner

const defaultMocks = {
  cliConfig: {
    api: {projectId: '1234'} as CliConfig['api'],
  },
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
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('show console error when no projectId is found', async () => {
    const {error} = await testCommand(MediaImportCommand, ['test-source'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {}},
      },
    })

    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
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

  describe('outside project context', () => {
    const noProjectRootMocks = {
      cliConfigError: new ProjectRootNotFoundError('No project root found'),
      token: 'test-token',
    }

    test('works with --project-id flag when no project root', async () => {
      mockApi({
        apiVersion: MEDIA_LIBRARY_API_VERSION,
        method: 'get',
        query: {projectId: 'flag-project'},
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

      mocks.importer.mockReturnValue(of({asset: {originalFilename: 'img1.jpg'}, fileCount: 1}))

      const {error} = await testCommand(
        MediaImportCommand,
        ['test-source', '--project-id', 'flag-project', '--media-library-id', 'test-media-library'],
        {mocks: noProjectRootMocks},
      )
      if (error) throw error

      expect(mockSpinnerInstance.succeed).toHaveBeenCalledWith('Imported 1 assets')
    })

    test('errors when no project root and no --project-id', async () => {
      const {error} = await testCommand(MediaImportCommand, ['test-source'], {
        mocks: noProjectRootMocks,
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Unable to determine project ID')
      expect(error?.oclif?.exit).toBe(1)
    })
  })
})
