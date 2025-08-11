import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {HOOK_API_VERSION} from '../../../actions/hook/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {Logs} from '../logs.js'

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

describe('#logs', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['hook logs', '--help'])

    expect(stdout).toContain('List latest log entries for a given hook')
  })

  test('displays error when no project ID is found', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {
        projectId: undefined,
      },
    })

    const {error} = await testCommand(Logs)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
  })

  test('displays error when no hooks are registered', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [])

    const {error} = await testCommand(Logs)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No hooks currently registered')
  })

  test('displays error when specified hook is not found', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: 'hook-1',
        name: 'test-hook',
        type: 'document',
      },
    ])

    const {error} = await testCommand(Logs, ['non-existent-hook'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook with name "non-existent-hook" not found')
  })

  test('displays logs for a single hook', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: 'hook-1',
        name: 'test-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/hook-1/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        hookId: 'hook-1',
        id: 'msg-1',
        projectId: 'test-project',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/hook-1/attempts',
    }).reply(200, [
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        id: 'attempt-1',
        messageId: 'msg-1',
        status: 'failure',
        statusCode: 404,
      },
    ])

    const {stdout} = await testCommand(Logs)

    expect(stdout).toContain('Date: 2025-08-07T09:15:36.628Z')
    expect(stdout).toContain('Status: failure')
    expect(stdout).toContain('Result code: 404')
    expect(stdout).toContain('Failures: 1')
  })

  test('displays logs for a specified hook', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: 'hook-1',
        name: 'test-hook',
        type: 'document',
      },
      {
        id: 'hook-2',
        name: 'another-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/hook-1/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        hookId: 'hook-1',
        id: 'msg-1',
        projectId: 'test-project',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/hook-1/attempts',
    }).reply(200, [
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        id: 'attempt-1',
        messageId: 'msg-1',
        status: 'success',
        statusCode: 200,
      },
    ])

    const {stdout} = await testCommand(Logs, ['test-hook'])

    expect(stdout).toContain('Date: 2025-08-07T09:15:36.628Z')
    expect(stdout).toContain('Status: success')
    expect(stdout).toContain('Result code: 200')
    expect(stdout).toContain('Failures: 1')
  })

  test('displays error when hook logs retrieval fails', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: 'hook-1',
        name: 'test-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/hook-1/messages',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(Logs)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook logs retrieval failed')
  })
})
