import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {HOOK_API_VERSION} from '../../../actions/hook/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {List} from '../list.js'

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

describe('#list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['hook list', '--help'])

    expect(stdout).toContain('List hooks for a given project')
  })

  test('displays hooks correctly', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        apiVersion: '2021-10-04',
        createdAt: '2023-01-01',
        createdByUserId: 'user1',
        dataset: '*',
        deletedAt: null,
        description: 'test description',
        headers: {},
        httpMethod: 'POST',
        id: 'hook1',
        includeDrafts: false,
        isDisabled: false,
        isDisabledByUser: false,
        name: 'test versions',
        projectId: 'project1',
        rule: {
          filter: null,
          on: ['create'],
          projection: null,
        },
        secret: null,
        type: 'document',
        url: 'https://webhook.site/b627a04b-52f5-4ecd-9d45-55fdc88ff4e7',
      },
    ])

    const {stdout} = await testCommand(List)

    expect(stdout).toContain('Name: test versions')
    expect(stdout).toContain('Dataset: *')
    expect(stdout).toContain('URL: https://webhook.site/b627a04b-52f5-4ecd-9d45-55fdc88ff4e7')
    expect(stdout).toContain('HTTP method: POST')
    expect(stdout).toContain('Description: test description')
  })

  test('handles legacy hooks without description', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        createdAt: '2023-01-01',
        createdByUserId: 'user1',
        dataset: 'production',
        deletedAt: null,
        description: null,
        id: 'hook1',
        isDisabled: false,
        isDisabledByUser: false,
        name: 'legacy hook',
        projectId: 'project1',
        type: 'transaction',
        url: 'https://example.com/webhook',
      },
    ])

    const {stdout} = await testCommand(List)

    expect(stdout).toContain('Name: legacy hook')
    expect(stdout).toContain('Dataset: production')
    expect(stdout).toContain('URL: https://example.com/webhook')
    expect(stdout).not.toContain('HTTP method')
    expect(stdout).not.toContain('Description')
  })

  test('displays an error if the API request fails', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(List)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook list retrieval failed')
  })

  test('handles empty hooks list', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [])

    const {stdout} = await testCommand(List)

    expect(stdout).toBe('')
  })

  test('throws error when no project ID is found', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {
        projectId: undefined,
      },
    })

    const {error} = await testCommand(List)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
  })
})
