import {getStudioConfig} from '@sanity/cli-core/config'
import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import open from 'open'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ManageCommand} from '../manage.js'

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('@sanity/cli-core/config', () => import('@sanity/cli-test/mocks/cli-core/config'))
vi.mock('open', () => ({default: vi.fn()}))

describe('#manage', () => {
  beforeEach(() => {
    mocks.SanityCmdGetCliConfig.mockResolvedValue({})
    mocks.SanityCmdGetProjectRoot.mockResolvedValue({})
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('open link to project management interface if cli config has projectId', async () => {
    mocks.SanityCmdGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project-id',
      },
    })
    await ManageCommand.run([])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Opening https://www.sanity.io/manage/project/test-project-id'),
    )
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/manage/project/test-project-id')
  })

  test('open link to project management interface if studio config has projectId', async () => {
    vi.mocked(getStudioConfig).mockResolvedValueOnce({
      basePath: 'test-base-path',
      dataset: 'test-dataset',
      name: 'test-name',
      projectId: 'test-project-id',
      schema: {
        types: [],
      },
      unstable_sources: [],
    })

    await ManageCommand.run([])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Opening https://www.sanity.io/manage/project/test-project-id'),
    )
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/manage/project/test-project-id')
  })

  test('open root link to manage page if studio config is array', async () => {
    vi.mocked(getStudioConfig).mockResolvedValueOnce([
      {
        basePath: 'test-base-path',
        dataset: 'test-dataset',
        name: 'test-name',
        projectId: 'test-project-id',
        schema: {
          _original: {
            types: [],
          },
          types: [],
        },
        title: 'test-title',
        unstable_sources: [],
      },
    ])

    await ManageCommand.run([])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Opening https://www.sanity.io/manage/'),
    )
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/manage/')
  })

  test('opens root manage page if no projectId is found', async () => {
    vi.mocked(getStudioConfig).mockResolvedValueOnce({} as never)

    await ManageCommand.run([])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Opening https://www.sanity.io/manage/'),
    )
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/manage/')
  })
})
