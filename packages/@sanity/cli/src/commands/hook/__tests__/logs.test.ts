import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'
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

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    select: vi.fn(),
  }
})

const mockedGetCliConfig = vi.mocked(getCliConfig)
const mockedSelect = vi.mocked(select)

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
    mockedGetCliConfig.mockResolvedValueOnce({
      api: {
        projectId: undefined,
      },
    })

    const {error} = await testCommand(LogsHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('displays error when no hooks are registered', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [])

    const {error} = await testCommand(LogsHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No hooks currently registered')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('displays error when specified hook is not found', async () => {
    const HOOK_ID = 'not-found-hook-test'

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      },
    ])

    const {error} = await testCommand(LogsHookCommand, ['non-existent-hook'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook with name "non-existent-hook" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('displays logs for a single hook', async () => {
    const HOOK_ID = 'single-hook-test'
    const MESSAGE_ID = 'single-msg-test'
    const ATTEMPT_ID = 'single-attempt-test'

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/messages`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        dataset: 'production',
        failureCount: 1,
        hookId: HOOK_ID,
        id: MESSAGE_ID,
        payload: '{"test": true}',
        projectId: 'test-project',
        resultCode: 404,
        status: 'failure',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/attempts`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        failureReason: 'http',
        hookId: HOOK_ID,
        id: ATTEMPT_ID,
        inProgress: false,
        isFailure: true,
        messageId: MESSAGE_ID,
        projectId: 'test-project',
        resultCode: 404,
      },
    ])

    const {stdout} = await testCommand(LogsHookCommand)

    expect(stdout).toContain('Date: 2025-08-07T09:15:36.628Z')
    expect(stdout).toContain('Status: failure')
    expect(stdout).toContain('Result code: 404')
    expect(stdout).toContain('Failures: 1')
  })

  test('displays logs for a specified hook', async () => {
    const HOOK_ID_1 = 'specified-hook-test-1'
    const HOOK_ID_2 = 'specified-hook-test-2'
    const MESSAGE_ID = 'specified-msg-test'
    const ATTEMPT_ID = 'specified-attempt-test'

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID_1,
        name: 'test-hook',
        type: 'document',
      },
      {
        id: HOOK_ID_2,
        name: 'another-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID_1}/messages`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        dataset: 'production',
        failureCount: 0,
        hookId: HOOK_ID_1,
        id: MESSAGE_ID,
        payload: '{"test": true}',
        projectId: 'test-project',
        resultCode: 200,
        status: 'success',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID_1}/attempts`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        failureReason: '',
        hookId: HOOK_ID_1,
        id: ATTEMPT_ID,
        inProgress: false,
        isFailure: false,
        messageId: MESSAGE_ID,
        projectId: 'test-project',
        resultCode: 200,
      },
    ])

    const {stdout} = await testCommand(LogsHookCommand, ['test-hook'])

    expect(stdout).toContain('Date: 2025-08-07T09:15:36.628Z')
    expect(stdout).toContain('Status: success')
    expect(stdout).toContain('Result code: 200')
    expect(stdout).not.toContain('Failures:')
  })

  test('displays error when hook logs retrieval fails', async () => {
    const HOOK_ID = 'error-logs-hook-test'

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/messages`,
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(LogsHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook logs retrieval failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('prompts user to select hook when multiple hooks exist', async () => {
    const HOOK_ID_1 = 'select-hook-test-1'
    const HOOK_ID_2 = 'select-hook-test-2'
    const MESSAGE_ID = 'select-msg-test'

    mockedSelect.mockResolvedValue(HOOK_ID_2)

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID_1,
        name: 'first-hook',
        type: 'document',
      },
      {
        id: HOOK_ID_2,
        name: 'second-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID_2}/messages`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T10:00:00.000Z',
        dataset: 'production',
        failureCount: 1,
        hookId: HOOK_ID_2,
        id: MESSAGE_ID,
        payload: '{"selected": true}',
        projectId: 'test-project',
        resultCode: 500,
        status: 'failure',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID_2}/attempts`,
    }).reply(200, [])

    const {stdout} = await testCommand(LogsHookCommand)

    expect(vi.mocked(select)).toHaveBeenCalledWith({
      choices: [
        {name: 'first-hook', value: HOOK_ID_1},
        {name: 'second-hook', value: HOOK_ID_2},
      ],
      message: 'Select hook to list logs for',
    })

    expect(stdout).toContain('Date: 2025-08-07T10:00:00.000Z')
    expect(stdout).toContain('Status: failure')
    expect(stdout).toContain('Result code: 500')
    expect(stdout).toContain('Failures: 1')
  })

  test('matches hook name case-insensitively', async () => {
    const HOOK_ID = 'case-hook-test'
    const MESSAGE_ID = 'case-msg-test'

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID,
        name: 'Test-Hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/messages`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T11:00:00.000Z',
        dataset: 'production',
        failureCount: 0,
        hookId: HOOK_ID,
        id: MESSAGE_ID,
        payload: '{"case": "insensitive"}',
        projectId: 'test-project',
        resultCode: 200,
        status: 'success',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/attempts`,
    }).reply(200, [])

    const {stdout} = await testCommand(LogsHookCommand, ['test-hook'])

    expect(stdout).toContain('Date: 2025-08-07T11:00:00.000Z')
    expect(stdout).toContain('Status: success')
    expect(stdout).toContain('Result code: 200')
  })

  test('displays error when hook attempts retrieval fails', async () => {
    const HOOK_ID = 'attempt-error-hook-test'
    const MESSAGE_ID = 'attempt-error-msg-test'

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/messages`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T12:00:00.000Z',
        dataset: 'production',
        failureCount: 0,
        hookId: HOOK_ID,
        id: MESSAGE_ID,
        payload: '{"test": true}',
        projectId: 'test-project',
        resultCode: 200,
        status: 'success',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/attempts`,
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(LogsHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook logs retrieval failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('displays detailed output with --detailed flag', async () => {
    const HOOK_ID = 'detailed-hook-test'
    const MESSAGE_ID = 'detailed-msg-test'
    const ATTEMPT_TIMEOUT_ID = 'detailed-timeout-attempt-test'
    const ATTEMPT_PENDING_ID = 'detailed-pending-attempt-test'

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/messages`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T13:00:00.000Z',
        dataset: 'production',
        failureCount: 2,
        hookId: HOOK_ID,
        id: MESSAGE_ID,
        payload: '{"document": {"_id": "test", "_type": "post"}, "event": "create"}',
        projectId: 'test-project',
        resultCode: 400,
        status: 'failure',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/attempts`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T13:00:01.000Z',
        duration: 5000,
        failureReason: 'timeout',
        hookId: HOOK_ID,
        id: ATTEMPT_TIMEOUT_ID,
        inProgress: false,
        isFailure: true,
        messageId: MESSAGE_ID,
        projectId: 'test-project',
        resultBody: '',
        resultCode: 0,
        updatedAt: '2025-08-07T13:00:06.000Z',
      },
      {
        createdAt: '2025-08-07T13:00:10.000Z',
        duration: null,
        failureReason: '',
        hookId: HOOK_ID,
        id: ATTEMPT_PENDING_ID,
        inProgress: true,
        isFailure: false,
        messageId: MESSAGE_ID,
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
    const HOOK_ID = 'success-detailed-hook-test'
    const MESSAGE_ID = 'success-detailed-msg-test'
    const ATTEMPT_ID = 'success-detailed-attempt-test'

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/messages`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T14:00:00.000Z',
        dataset: 'production',
        failureCount: 0,
        hookId: HOOK_ID,
        id: MESSAGE_ID,
        payload: '{"success": true}',
        projectId: 'test-project',
        resultCode: 201,
        status: 'success',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/attempts`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T14:00:01.500Z',
        duration: 250,
        failureReason: '',
        hookId: HOOK_ID,
        id: ATTEMPT_ID,
        inProgress: false,
        isFailure: false,
        messageId: MESSAGE_ID,
        projectId: 'test-project',
        resultBody: 'Created',
        resultCode: 201,
        updatedAt: '2025-08-07T14:00:01.750Z',
      },
    ])

    const {stdout} = await testCommand(LogsHookCommand, ['--detailed'])

    expect(stdout).toContain('Date: 2025-08-07T14:00:00.000Z')
    expect(stdout).toContain('Status: success')
    expect(stdout).toContain('Result code: 201')
    expect(stdout).toContain('Payload:')
    expect(stdout).toContain('{ success: true }')
    expect(stdout).toContain('Attempts:')
    expect(stdout).toContain('[2025-08-07T14:00:01Z]')
    expect(stdout).toContain('Success: HTTP 201 (250ms)')
  })

  test('displays different failure reasons with detailed output', async () => {
    const HOOK_ID = 'failure-reasons-hook-test'
    const MESSAGE_ID = 'failure-reasons-msg-test'
    const ATTEMPT_HTTP_ID = 'failure-http-attempt-test'
    const ATTEMPT_NETWORK_ID = 'failure-network-attempt-test'
    const ATTEMPT_OTHER_ID = 'failure-other-attempt-test'

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/messages`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T15:00:00.000Z',
        dataset: 'production',
        failureCount: 4,
        hookId: HOOK_ID,
        id: MESSAGE_ID,
        payload: '{"failures": "test"}',
        projectId: 'test-project',
        resultCode: null,
        status: 'failure',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/attempts`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T15:00:01.000Z',
        duration: 100,
        failureReason: 'http',
        hookId: HOOK_ID,
        id: ATTEMPT_HTTP_ID,
        inProgress: false,
        isFailure: true,
        messageId: MESSAGE_ID,
        projectId: 'test-project',
        resultBody: 'Not Found',
        resultCode: 404,
        updatedAt: '2025-08-07T15:00:01.100Z',
      },
      {
        createdAt: '2025-08-07T15:00:02.000Z',
        duration: 0,
        failureReason: 'network',
        hookId: HOOK_ID,
        id: ATTEMPT_NETWORK_ID,
        inProgress: false,
        isFailure: true,
        messageId: MESSAGE_ID,
        projectId: 'test-project',
        resultBody: '',
        resultCode: 0,
        updatedAt: '2025-08-07T15:00:02.000Z',
      },
      {
        createdAt: '2025-08-07T15:00:03.000Z',
        duration: 200,
        failureReason: 'other',
        hookId: HOOK_ID,
        id: ATTEMPT_OTHER_ID,
        inProgress: false,
        isFailure: true,
        messageId: MESSAGE_ID,
        projectId: 'test-project',
        resultBody: '',
        resultCode: 0,
        updatedAt: '2025-08-07T15:00:03.200Z',
      },
    ])

    const {stdout} = await testCommand(LogsHookCommand, ['--detailed'])

    expect(stdout).toContain('Date: 2025-08-07T15:00:00.000Z')
    expect(stdout).toContain('Status: failure')
    expect(stdout).toContain('Failures: 4')
    expect(stdout).toContain('Payload:')
    expect(stdout).toContain("{ failures: 'test' }")
    expect(stdout).toContain('Attempts:')
    expect(stdout).toContain(
      `Failure: HTTP 404 (run \`sanity hook attempt ${ATTEMPT_HTTP_ID}\` for details)`,
    )
    expect(stdout).toContain('Failure: Network error')
    expect(stdout).toContain('Failure: Unknown error')
  })

  test('displays multiple messages with separators', async () => {
    const HOOK_ID = 'multiple-messages-hook-test'
    const MESSAGE_ID_1 = 'multiple-msg-1-test'
    const MESSAGE_ID_2 = 'multiple-msg-2-test'
    const ATTEMPT_ID_1 = 'multiple-attempt-1-test'
    const ATTEMPT_ID_2 = 'multiple-attempt-2-test'

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/messages`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T16:00:00.000Z',
        dataset: 'production',
        failureCount: 0,
        hookId: HOOK_ID,
        id: MESSAGE_ID_1,
        payload: '{"first": true}',
        projectId: 'test-project',
        resultCode: 200,
        status: 'success',
      },
      {
        createdAt: '2025-08-07T16:01:00.000Z',
        dataset: 'production',
        failureCount: 1,
        hookId: HOOK_ID,
        id: MESSAGE_ID_2,
        payload: '{"second": true}',
        projectId: 'test-project',
        resultCode: 500,
        status: 'failure',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/attempts`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T16:00:01.000Z',
        duration: 100,
        failureReason: '',
        hookId: HOOK_ID,
        id: ATTEMPT_ID_1,
        inProgress: false,
        isFailure: false,
        messageId: MESSAGE_ID_1,
        projectId: 'test-project',
        resultBody: 'OK',
        resultCode: 200,
        updatedAt: '2025-08-07T16:00:01.100Z',
      },
      {
        createdAt: '2025-08-07T16:01:01.000Z',
        duration: 200,
        failureReason: 'http',
        hookId: HOOK_ID,
        id: ATTEMPT_ID_2,
        inProgress: false,
        isFailure: true,
        messageId: MESSAGE_ID_2,
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
    expect(error?.oclif?.exit).toBe(1)
  })

  test('displays error when no hook is selected from prompt', async () => {
    const HOOK_ID_1 = 'no-select-hook-1-test'
    const HOOK_ID_2 = 'no-select-hook-2-test'

    mockedSelect.mockResolvedValue('non-existent-hook-id')

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID_1,
        name: 'first-hook',
        type: 'document',
      },
      {
        id: HOOK_ID_2,
        name: 'second-hook',
        type: 'document',
      },
    ])

    const {error} = await testCommand(LogsHookCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No hook selected')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('displays message without attempts section when attempts array is empty', async () => {
    const HOOK_ID = 'empty-attempts-hook-test'
    const MESSAGE_ID = 'empty-attempts-msg-test'

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project',
    }).reply(200, [
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/messages`,
    }).reply(200, [
      {
        createdAt: '2025-08-07T17:00:00.000Z',
        dataset: 'production',
        failureCount: 0,
        hookId: HOOK_ID,
        id: MESSAGE_ID,
        payload: '{"no_attempts": true}',
        projectId: 'test-project',
        resultCode: 200,
        status: 'queued',
      },
    ])

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: `/hooks/projects/test-project/${HOOK_ID}/attempts`,
    }).reply(200, [])

    const {stdout} = await testCommand(LogsHookCommand, ['--detailed'])

    expect(stdout).toContain('Date: 2025-08-07T17:00:00.000Z')
    expect(stdout).toContain('Status: queued')
    expect(stdout).toContain('Result code: 200')
    expect(stdout).toContain('Payload:')
    expect(stdout).toContain('{ no_attempts: true }')
    expect(stdout).not.toContain('Attempts:') // No attempts section when empty
  })
})
