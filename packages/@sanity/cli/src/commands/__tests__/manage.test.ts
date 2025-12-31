import {runCommand} from '@oclif/test'
import {getStudioConfig} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ManageCommand} from '../manage.js'

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    getStudioConfig: vi.fn(),
  }
})

const defaultMocks = {
  cliConfig: {},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
}

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
    const {stdout} = await testCommand(ManageCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            projectId: 'test-project-id',
          },
        },
      },
    })

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
      unstable_sources: [],
    })

    const {stdout} = await testCommand(ManageCommand, [], {mocks: defaultMocks})

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
        unstable_sources: [],
      },
    ])

    const {stdout} = await testCommand(ManageCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Opening https://www.sanity.io/manage/')
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/manage/')
  })

  test('opens root manage page if no projectId is found', async () => {
    vi.mocked(getStudioConfig).mockResolvedValueOnce({} as never)

    const {stdout} = await testCommand(ManageCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Opening https://www.sanity.io/manage/')
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/manage/')
  })
})
