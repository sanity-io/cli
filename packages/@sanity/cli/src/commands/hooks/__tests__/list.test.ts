import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {HOOK_API_VERSION} from '../../../actions/hook/constants.js'
import {List} from '../list.js'

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

describe('#list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('displays hooks correctly', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/${testProjectId}`,
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

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toContain('Name: test versions')
    expect(stdout).toContain('Dataset: *')
    expect(stdout).toContain('URL: https://webhook.site/b627a04b-52f5-4ecd-9d45-55fdc88ff4e7')
    expect(stdout).toContain('HTTP method: POST')
    expect(stdout).toContain('Description: test description')
  })

  test('handles legacy hooks without description', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/${testProjectId}`,
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

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toContain('Name: legacy hook')
    expect(stdout).toContain('Dataset: production')
    expect(stdout).toContain('URL: https://example.com/webhook')
    expect(stdout).not.toContain('HTTP method')
    expect(stdout).not.toContain('Description')
  })

  test('displays an error if the API request fails', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/${testProjectId}`,
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(List, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook list retrieval failed')
  })

  test('handles empty hooks list', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/${testProjectId}`,
    }).reply(200, [])

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toBe('')
  })

  test('throws error when no project ID is found', async () => {
    const {error} = await testCommand(List, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
  })
})
