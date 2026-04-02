import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {HOOK_API_VERSION} from '../../../actions/hook/constants.js'
import {Delete} from '../delete.js'

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    select: vi.fn(),
  }
})

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

const mockSelect = vi.mocked(await import('@sanity/cli-core/ux')).select

describe('#delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('deletes a hook by name', async () => {
    const mockHook = {
      dataset: 'production',
      id: 'hook1',
      name: 'test-hook',
      type: 'document' as const,
      url: 'https://example.com/webhook',
    }

    // Mock the hooks list API call
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [mockHook])

    // Mock the delete API call
    mockApi({
      apiVersion: HOOK_API_VERSION,
      method: 'delete',
      uri: '/hooks/projects/test-project/hook1',
    }).reply(200)

    const {stdout} = await testCommand(Delete, ['test-hook'], {mocks: defaultMocks})

    expect(stdout).toContain('Hook deleted')
  })

  test('displays error when hook name not found', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        dataset: 'production',
        id: 'hook1',
        name: 'different-hook',
        type: 'document' as const,
        url: 'https://example.com/webhook',
      },
    ])

    const {error} = await testCommand(Delete, ['nonexistent-hook'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook with name "nonexistent-hook" not found')
  })

  test('displays error when no hooks exist', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [])

    const {error} = await testCommand(Delete, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No hooks configured for this project')
  })

  test('prompts for hook selection when no name provided', async () => {
    const mockHooks = [
      {
        dataset: 'production',
        id: 'hook1',
        name: 'first-hook',
        type: 'document' as const,
        url: 'https://example.com/webhook1',
      },
      {
        dataset: 'staging',
        id: 'hook2',
        name: 'second-hook',
        type: 'transaction' as const,
        url: 'https://example.com/webhook2',
      },
    ]

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, mockHooks)

    mockApi({
      apiVersion: HOOK_API_VERSION,
      method: 'delete',
      uri: '/hooks/projects/test-project/hook2',
    }).reply(200)

    mockSelect.mockResolvedValueOnce('hook2')

    const {stdout} = await testCommand(Delete, [], {mocks: defaultMocks})

    expect(mockSelect).toHaveBeenCalledWith({
      choices: [
        {name: 'first-hook', value: 'hook1'},
        {name: 'second-hook', value: 'hook2'},
      ],
      message: 'Select hook to delete',
    })
    expect(stdout).toContain('Hook deleted')
  })

  test('handles API error when fetching hooks', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(Delete, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch hooks')
  })

  test('handles API error when deleting hook', async () => {
    const mockHook = {
      dataset: 'production',
      id: 'hook1',
      name: 'test-hook',
      type: 'document' as const,
      url: 'https://example.com/webhook',
    }

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [mockHook])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      method: 'delete',
      uri: '/hooks/projects/test-project/hook1',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(Delete, ['test-hook'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook deletion failed')
  })

  test('throws error when no project ID is found', async () => {
    const {error} = await testCommand(Delete, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
  })

  test('handles case insensitive hook name matching', async () => {
    const mockHook = {
      dataset: 'production',
      id: 'hook1',
      name: 'Test-Hook-Name',
      type: 'document' as const,
      url: 'https://example.com/webhook',
    }

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [mockHook])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      method: 'delete',
      uri: '/hooks/projects/test-project/hook1',
    }).reply(200)

    const {stdout} = await testCommand(Delete, ['test-hook-name'], {mocks: defaultMocks})

    expect(stdout).toContain('Hook deleted')
  })
})
