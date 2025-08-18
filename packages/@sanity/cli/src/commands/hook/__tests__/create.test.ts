import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {HOOK_API_VERSION} from '../../../actions/hook/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {CreateHookCommand} from '../create.js'

vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', async () => {
  return {
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    }),
  }
})

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', async () => {
  return {
    getCliConfig: vi.fn().mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    }),
  }
})

describe('#hook:create', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['hook create', '--help'])

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
    const open = await import('open')

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/projects/test-project',
    }).reply(200, {
      id: 'test-project',
      organizationId: 'test-org',
    })

    const {stdout} = await testCommand(CreateHookCommand)

    expect(open.default).toHaveBeenCalledWith(
      'https://www.sanity.io/organizations/test-org/project/test-project/api/webhooks/new',
    )
    expect(stdout).toContain(
      'Opening https://www.sanity.io/organizations/test-org/project/test-project/api/webhooks/new',
    )
  })

  test('opens webhook creation URL for project without organization (personal)', async () => {
    const open = await import('open')

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/projects/test-project',
    }).reply(200, {
      id: 'test-project',
    })

    const {stdout} = await testCommand(CreateHookCommand)

    expect(open.default).toHaveBeenCalledWith(
      'https://www.sanity.io/organizations/personal/project/test-project/api/webhooks/new',
    )
    expect(stdout).toContain(
      'Opening https://www.sanity.io/organizations/personal/project/test-project/api/webhooks/new',
    )
  })

  test('displays an error if the project fetch fails', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/projects/test-project',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(CreateHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch project information')
  })

  test('throws error when no project ID is found', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {
        projectId: undefined,
      },
    })

    const {error} = await testCommand(CreateHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
  })

  test('handles open failure gracefully', async () => {
    const open = await import('open')
    vi.mocked(open.default).mockRejectedValueOnce(new Error('Failed to open browser'))

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/projects/test-project',
    }).reply(200, {
      id: 'test-project',
      organizationId: 'test-org',
    })

    const {error} = await testCommand(CreateHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to open browser')
  })
})
