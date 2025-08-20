import {select} from '@inquirer/prompts'
import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest' // This should match the version in services/hooks.ts

import {HOOK_API_VERSION} from '../../../actions/hook/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {LogsHookCommand} from '../logs.js'

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

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
}))

describe('#hook:logs', () => {
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

    const {error} = await testCommand(LogsHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
  })

  test('displays error when no hooks are registered', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [])

    const {error} = await testCommand(LogsHookCommand)

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

    const {error} = await testCommand(LogsHookCommand, ['non-existent-hook'])

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
      uri: '/hooks/projects/test-project/hook-1/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        dataset: 'production',
        failureCount: 1,
        hookId: 'hook-1',
        id: 'msg-1',
        payload: '{"test": true}',
        projectId: 'test-project',
        resultCode: 404,
        status: 'failure',
      },
    ])

    nock('https://api.sanity.io')
      .get(`/${HOOK_API_VERSION}/hooks/projects/test-project/hook-1/attempts`)
      .reply(200, [
        {
          createdAt: '2025-08-07T09:15:36.628Z',
          duration: 150,
          failureReason: 'http',
          hookId: 'hook-1',
          id: 'attempt-1',
          inProgress: false,
          isFailure: true,
          messageId: 'msg-1',
          projectId: 'test-project',
          resultBody: 'Not Found',
          resultCode: 404,
          updatedAt: null,
        },
      ])

    const {stdout} = await testCommand(LogsHookCommand)

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
      uri: '/hooks/projects/test-project/hook-1/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        dataset: 'production',
        failureCount: 0,
        hookId: 'hook-1',
        id: 'msg-1',
        payload: '{"test": true}',
        projectId: 'test-project',
        resultCode: 200,
        status: 'success',
      },
    ])

    nock('https://api.sanity.io')
      .get(`/${HOOK_API_VERSION}/hooks/projects/test-project/hook-1/attempts`)
      .reply(200, [
        {
          createdAt: '2025-08-07T09:15:36.628Z',
          duration: 150,
          failureReason: '',
          hookId: 'hook-1',
          id: 'attempt-1',
          inProgress: false,
          isFailure: false,
          messageId: 'msg-1',
          projectId: 'test-project',
          resultBody: 'OK',
          resultCode: 200,
          updatedAt: null,
        },
      ])

    const {stdout} = await testCommand(LogsHookCommand, ['test-hook'])

    expect(stdout).toContain('Date: 2025-08-07T09:15:36.628Z')
    expect(stdout).toContain('Status: success')
    expect(stdout).toContain('Result code: 200')
    expect(stdout).not.toContain('Failures:')
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
      uri: '/hooks/projects/test-project/hook-1/messages',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(LogsHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook logs retrieval failed')
  })

  test('prompts user to select hook when multiple hooks exist', async () => {
    vi.mocked(select).mockResolvedValue('hook-2')

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: 'hook-1',
        name: 'first-hook',
        type: 'document',
      },
      {
        id: 'hook-2',
        name: 'second-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project/hook-2/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T10:00:00.000Z',
        dataset: 'production',
        failureCount: 1,
        hookId: 'hook-2',
        id: 'msg-2',
        payload: '{"selected": true}',
        projectId: 'test-project',
        resultCode: 500,
        status: 'failure',
      },
    ])

    nock('https://api.sanity.io')
      .get(`/${HOOK_API_VERSION}/hooks/projects/test-project/hook-2/attempts`)
      .reply(200, [])

    const {stdout} = await testCommand(LogsHookCommand)

    expect(vi.mocked(select)).toHaveBeenCalledWith({
      choices: [
        {name: 'first-hook', value: 'hook-1'},
        {name: 'second-hook', value: 'hook-2'},
      ],
      message: 'Select hook to list logs for',
    })
    expect(stdout).toContain('Date: 2025-08-07T10:00:00.000Z')
    expect(stdout).toContain('Status: failure')
    expect(stdout).toContain('Result code: 500')
    expect(stdout).toContain('Failures: 1')
  })

  test('matches hook name case-insensitively', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: 'hook-1',
        name: 'Test-Hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project/hook-1/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T11:00:00.000Z',
        dataset: 'production',
        failureCount: 0,
        hookId: 'hook-1',
        id: 'msg-case',
        payload: '{"case": "insensitive"}',
        projectId: 'test-project',
        resultCode: 200,
        status: 'success',
      },
    ])

    nock('https://api.sanity.io')
      .get(`/${HOOK_API_VERSION}/hooks/projects/test-project/hook-1/attempts`)
      .reply(200, [])

    const {stdout} = await testCommand(LogsHookCommand, ['test-hook'])

    expect(stdout).toContain('Date: 2025-08-07T11:00:00.000Z')
    expect(stdout).toContain('Status: success')
  })

  test('displays error when hook attempts retrieval fails', async () => {
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
      uri: '/hooks/projects/test-project/hook-1/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T12:00:00.000Z',
        dataset: 'production',
        failureCount: 0,
        hookId: 'hook-1',
        id: 'msg-fail',
        payload: '{"test": true}',
        projectId: 'test-project',
        resultCode: 200,
        status: 'success',
      },
    ])

    nock('https://api.sanity.io')
      .get(`/${HOOK_API_VERSION}/hooks/projects/test-project/hook-1/attempts`)
      .reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(LogsHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook logs retrieval failed')
  })

  test('displays detailed output with --detailed flag', async () => {
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
      uri: '/hooks/projects/test-project/hook-1/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T13:00:00.000Z',
        dataset: 'production',
        failureCount: 2,
        hookId: 'hook-1',
        id: 'msg-detailed',
        payload: '{"document": {"_id": "test", "_type": "post"}, "event": "create"}',
        projectId: 'test-project',
        resultCode: 400,
        status: 'failure',
      },
    ])

    nock('https://api.sanity.io')
      .get(`/${HOOK_API_VERSION}/hooks/projects/test-project/hook-1/attempts`)
      .reply(200, [
      {
        createdAt: '2025-08-07T13:00:01.000Z',
        duration: 5000,
        failureReason: 'timeout',
        hookId: 'hook-1',
        id: 'attempt-timeout',
        inProgress: false,
        isFailure: true,
        messageId: 'msg-detailed',
        projectId: 'test-project',
        resultBody: '',
        resultCode: 0,
        updatedAt: '2025-08-07T13:00:06.000Z',
      },
      {
        createdAt: '2025-08-07T13:00:10.000Z',
        duration: null,
        failureReason: '',
        hookId: 'hook-1',
        id: 'attempt-pending',
        inProgress: true,
        isFailure: false,
        messageId: 'msg-detailed',
        projectId: 'test-project',
        resultBody: '',
        resultCode: 0,
        updatedAt: null,
      },
    ])

    const {stdout} = await testCommand(LogsHookCommand, ['--detailed'])

    expect(stdout).toContain('Date: 2025-08-07T13:00:00.000Z')
    expect(stdout).toContain('Status: failure')
    expect(stdout).toContain('Result code: 400')
    expect(stdout).toContain('Failures: 2')
    expect(stdout).toContain('Payload:')
    expect(stdout).toContain('document')
    expect(stdout).toContain('_type')
    expect(stdout).toContain('post')
    expect(stdout).toContain('Attempts:')
    expect(stdout).toContain('[2025-08-07T13:00:01Z]')
    expect(stdout).toContain('Failure: Request timed out')
    expect(stdout).toContain('[2025-08-07T13:00:10Z]')
    expect(stdout).toContain('Pending')
  })

  test('displays detailed output with successful attempts', async () => {
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
      uri: '/hooks/projects/test-project/hook-1/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T14:00:00.000Z',
        dataset: 'production',
        failureCount: 0,
        hookId: 'hook-1',
        id: 'msg-success',
        payload: '{"success": true}',
        projectId: 'test-project',
        resultCode: 201,
        status: 'success',
      },
    ])

    nock('https://api.sanity.io')
      .get(`/${HOOK_API_VERSION}/hooks/projects/test-project/hook-1/attempts`)
      .reply(200, [
      {
        createdAt: '2025-08-07T14:00:01.500Z',
        duration: 250,
        failureReason: '',
        hookId: 'hook-1',
        id: 'attempt-success',
        inProgress: false,
        isFailure: false,
        messageId: 'msg-success',
        projectId: 'test-project',
        resultBody: 'Created',
        resultCode: 201,
        updatedAt: '2025-08-07T14:00:01.750Z',
      },
    ])

    const {stdout} = await testCommand(LogsHookCommand, ['--detailed'])

    expect(stdout).toContain('Success: HTTP 201 (250ms)')
  })

  test('displays different failure reasons with detailed output', async () => {
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
      uri: '/hooks/projects/test-project/hook-1/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T15:00:00.000Z',
        dataset: 'production',
        failureCount: 4,
        hookId: 'hook-1',
        id: 'msg-failures',
        payload: '{"failures": "test"}',
        projectId: 'test-project',
        resultCode: null,
        status: 'failure',
      },
    ])

    nock('https://api.sanity.io')
      .get(`/${HOOK_API_VERSION}/hooks/projects/test-project/hook-1/attempts`)
      .reply(200, [
      {
        createdAt: '2025-08-07T15:00:01.000Z',
        duration: 100,
        failureReason: 'http',
        hookId: 'hook-1',
        id: 'attempt-http',
        inProgress: false,
        isFailure: true,
        messageId: 'msg-failures',
        projectId: 'test-project',
        resultBody: 'Not Found',
        resultCode: 404,
        updatedAt: '2025-08-07T15:00:01.100Z',
      },
      {
        createdAt: '2025-08-07T15:00:02.000Z',
        duration: 0,
        failureReason: 'network',
        hookId: 'hook-1',
        id: 'attempt-network',
        inProgress: false,
        isFailure: true,
        messageId: 'msg-failures',
        projectId: 'test-project',
        resultBody: '',
        resultCode: 0,
        updatedAt: '2025-08-07T15:00:02.000Z',
      },
      {
        createdAt: '2025-08-07T15:00:03.000Z',
        duration: 200,
        failureReason: 'other',
        hookId: 'hook-1',
        id: 'attempt-other',
        inProgress: false,
        isFailure: true,
        messageId: 'msg-failures',
        projectId: 'test-project',
        resultBody: '',
        resultCode: 0,
        updatedAt: '2025-08-07T15:00:03.200Z',
      },
    ])

    const {stdout} = await testCommand(LogsHookCommand, ['--detailed'])

    expect(stdout).toContain(
      'Failure: HTTP 404 (run `sanity hook attempt attempt-http` for details)',
    )
    expect(stdout).toContain('Failure: Network error')
    expect(stdout).toContain('Failure: Unknown error')
  })

  test('displays multiple messages with separators', async () => {
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
      uri: '/hooks/projects/test-project/hook-1/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T16:00:00.000Z',
        dataset: 'production',
        failureCount: 0,
        hookId: 'hook-1',
        id: 'msg-1',
        payload: '{"first": true}',
        projectId: 'test-project',
        resultCode: 200,
        status: 'success',
      },
      {
        createdAt: '2025-08-07T16:01:00.000Z',
        dataset: 'production',
        failureCount: 1,
        hookId: 'hook-1',
        id: 'msg-2',
        payload: '{"second": true}',
        projectId: 'test-project',
        resultCode: 500,
        status: 'failure',
      },
    ])

    nock('https://api.sanity.io')
      .get(`/${HOOK_API_VERSION}/hooks/projects/test-project/hook-1/attempts`)
      .reply(200, [
      {
        createdAt: '2025-08-07T16:00:01.000Z',
        duration: 100,
        failureReason: '',
        hookId: 'hook-1',
        id: 'attempt-1',
        inProgress: false,
        isFailure: false,
        messageId: 'msg-1',
        projectId: 'test-project',
        resultBody: 'OK',
        resultCode: 200,
        updatedAt: '2025-08-07T16:00:01.100Z',
      },
      {
        createdAt: '2025-08-07T16:01:01.000Z',
        duration: 200,
        failureReason: 'http',
        hookId: 'hook-1',
        id: 'attempt-2',
        inProgress: false,
        isFailure: true,
        messageId: 'msg-2',
        projectId: 'test-project',
        resultBody: 'Error',
        resultCode: 500,
        updatedAt: '2025-08-07T16:01:01.200Z',
      },
    ])

    const {stdout} = await testCommand(LogsHookCommand)

    expect(stdout).toContain('Date: 2025-08-07T16:00:00.000Z')
    expect(stdout).toContain('Status: success')
    expect(stdout).toContain('Result code: 200')
    expect(stdout).toContain('---') // Separator between messages
    expect(stdout).toContain('Date: 2025-08-07T16:01:00.000Z')
    expect(stdout).toContain('Status: failure')
    expect(stdout).toContain('Result code: 500')
    expect(stdout).toContain('Failures: 1')
    
    // Verify that the first message section (before "---") doesn't have failures
    const [firstSection] = stdout.split('---')
    expect(firstSection).not.toContain('Failures:')
  })

  test('displays error when fetching hooks fails', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(LogsHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook list retrieval failed')
    expect(error?.message).toContain('Internal Server Error')
  })

  test('displays error when no hook is selected from prompt', async () => {
    vi.mocked(select).mockResolvedValue('non-existent-hook-id')

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: 'hook-1',
        name: 'first-hook',
        type: 'document',
      },
      {
        id: 'hook-2',
        name: 'second-hook',
        type: 'document',
      },
    ])

    const {error} = await testCommand(LogsHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No hook selected')
  })

  test('handles empty attempts array gracefully', async () => {
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
      uri: '/hooks/projects/test-project/hook-1/messages',
    }).reply(200, [
      {
        createdAt: '2025-08-07T17:00:00.000Z',
        dataset: 'production',
        failureCount: 0,
        hookId: 'hook-1',
        id: 'msg-no-attempts',
        payload: '{"no_attempts": true}',
        projectId: 'test-project',
        resultCode: 200,
        status: 'queued',
      },
    ])

    nock('https://api.sanity.io')
      .get(`/${HOOK_API_VERSION}/hooks/projects/test-project/hook-1/attempts`)
      .reply(200, [])

    const {stdout} = await testCommand(LogsHookCommand, ['--detailed'])

    expect(stdout).toContain('Date: 2025-08-07T17:00:00.000Z')
    expect(stdout).toContain('Status: queued')
    expect(stdout).toContain('Result code: 200')
    expect(stdout).toContain('Payload:')
    expect(stdout).toContain('no_attempts')
    expect(stdout).not.toContain('Attempts:') // No attempts section when empty
  })
})
