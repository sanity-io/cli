import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {CreateHookCommand} from '../create.js'

vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}))

const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockGetById = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      projects: {
        getById: mockGetById,
      },
    }),
  }
})

describe('#hook:create', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['hook', 'create', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Create a new webhook for the current project

      USAGE
        $ sanity hook create

      DESCRIPTION
        Create a new webhook for the current project

      EXAMPLES
        Create a new webhook for the current project

          $ sanity hook create

      "
    `)
  })

  test('opens webhook creation URL for project with organization', async () => {
    mockGetById.mockResolvedValueOnce({
      id: 'test-project',
      organizationId: 'test-org',
    })

    const {stdout} = await testCommand(CreateHookCommand, [], {mocks: defaultMocks})

    expect(open).toHaveBeenCalledWith(
      'https://www.sanity.io/organizations/test-org/project/test-project/api/webhooks/new',
    )
    expect(stdout).toContain(
      'Opening https://www.sanity.io/organizations/test-org/project/test-project/api/webhooks/new',
    )
  })

  test('opens webhook creation URL for project without organization (personal)', async () => {
    mockGetById.mockResolvedValueOnce({
      id: 'test-project',
    })

    const {stdout} = await testCommand(CreateHookCommand, [], {mocks: defaultMocks})

    expect(open).toHaveBeenCalledWith(
      'https://www.sanity.io/organizations/personal/project/test-project/api/webhooks/new',
    )
    expect(stdout).toContain(
      'Opening https://www.sanity.io/organizations/personal/project/test-project/api/webhooks/new',
    )
  })

  test('displays an error if the project fetch fails', async () => {
    mockGetById.mockRejectedValueOnce(new Error('Internal Server Error'))

    const {error} = await testCommand(CreateHookCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch project information')
  })

  test('throws error when no project ID is found', async () => {
    const {error} = await testCommand(CreateHookCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
  })

  test('handles open failure gracefully', async () => {
    vi.mocked(open).mockRejectedValueOnce(new Error('Failed to open browser'))

    mockGetById.mockResolvedValueOnce({
      id: 'test-project',
      organizationId: 'test-org',
    })

    const {error} = await testCommand(CreateHookCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to open browser')
  })
})
