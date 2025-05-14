import {runCommand} from '@oclif/test'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {getStudioConfig} from '../../config/studio/getStudioConfig.js'
import {ManageCommand} from '../manage.js'

vi.mock(import('../../config/studio/getStudioConfig.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getStudioConfig: vi.fn(),
  }
})

vi.mock(import('../../config/findProjectRoot.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    }),
  }
})

vi.mock(import('../../config/cli/getCliConfig.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getCliConfig: vi.fn().mockResolvedValue({}),
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#manage', () => {
  test('--help works', async () => {
    const {stdout} = await runCommand(['manage', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Opens project management interface in your web browser

      USAGE
        $ sanity manage

      DESCRIPTION
        Opens project management interface in your web browser

      "
    `)
  })

  test('open link to project management interface if cli config has projectId', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {
        projectId: 'test-project-id',
      },
    })

    const {stdout} = await testCommand(ManageCommand)

    expect(stdout).toContain('Opening https://www.sanity.io/manage/project/test-project-id')
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
    })

    const {stdout} = await testCommand(ManageCommand)

    expect(stdout).toContain('Opening https://www.sanity.io/manage/project/test-project-id')
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
        },
        title: 'test-title',
      },
    ])

    const {stdout} = await testCommand(ManageCommand)

    expect(stdout).toContain('Opening https://www.sanity.io/manage/')
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/manage/')
  })

  test('opens root manage page if no projectId is found', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({})
    vi.mocked(getStudioConfig).mockResolvedValueOnce({} as never)

    const {stdout} = await testCommand(ManageCommand)

    expect(stdout).toContain('Opening https://www.sanity.io/manage/')
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/manage/')
  })
})
