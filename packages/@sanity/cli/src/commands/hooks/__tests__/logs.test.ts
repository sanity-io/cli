import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import * as uxMocks from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {type DeliveryAttempt, type Hook} from '../../../actions/hook/types.js'
import {LogsHookCommand} from '../logs.js'

const mockedGetHooks = vi.hoisted(() => vi.fn())
const mockedGetHookAttempts = vi.hoisted(() => vi.fn())
const mockedGetHookMessages = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('../../../services/hooks.js', () => ({
  getHookAttemptsForProject: mockedGetHookAttempts,
  getHookMessagesForProject: mockedGetHookMessages,
  getHooksForProject: mockedGetHooks,
}))
vi.mock('../../../prompts/promptForProject.js', () => ({
  promptForProject: vi.fn(),
}))

const HOOK_ID = 'test-hook-id'
const TEST_HOOK = {
  id: HOOK_ID,
  name: 'test-hook',
  type: 'document',
} as Hook

describe('#hook:logs', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('displays error when problem retrieving hooks', async () => {
    mockedGetHooks.mockRejectedValue(new Error('boom'))

    await LogsHookCommand.run()

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('Hook list retrieval failed'),
      {
        exit: 1,
      },
    )
  })
  test('displays error when no hooks are registered', async () => {
    mockedGetHooks.mockResolvedValue([])

    await LogsHookCommand.run()

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith('No hooks currently registered', {
      exit: 1,
    })
  })

  test('displays error when specified hook is not found', async () => {
    mockedGetHooks.mockResolvedValue([TEST_HOOK])

    await LogsHookCommand.run(['non-existent-hook'])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      'Hook with name "non-existent-hook" not found',
      {
        exit: 1,
      },
    )
  })

  test('displays logs for the one single hook when only it exists', async () => {
    const MESSAGE_ID = 'single-msg-test'
    const ATTEMPT_ID = 'single-attempt-test'

    mockedGetHooks.mockResolvedValue([TEST_HOOK])
    mockedGetHookAttempts.mockResolvedValue([
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        failureReason: 'http',
        hookId: TEST_HOOK.id,
        id: ATTEMPT_ID,
        inProgress: false,
        isFailure: true,
        messageId: MESSAGE_ID,
        projectId: 'test-project',
        resultCode: 404,
      } as DeliveryAttempt,
    ])
    mockedGetHookMessages.mockResolvedValue([
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        dataset: 'production',
        failureCount: 1,
        hookId: TEST_HOOK.id,
        id: MESSAGE_ID,
        payload: '{"test": true}',
        projectId: 'test-project',
        resultCode: 404,
        status: 'failure',
      },
    ])

    await LogsHookCommand.run([])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Date: 2025-08-07T09:15:36.628Z')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Status: failure')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Result code: 404')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Failures: 1')
  })

  test('displays logs for a specified hook when multiple exist', async () => {
    const HOOK_ID_2 = 'specified-hook-test-2'
    const MESSAGE_ID = 'specified-msg-test'
    const ATTEMPT_ID = 'specified-attempt-test'

    mockedGetHooks.mockResolvedValue([
      {...TEST_HOOK, id: HOOK_ID},
      {...TEST_HOOK, id: HOOK_ID_2, name: 'some-other-hook'},
    ])
    mockedGetHookMessages.mockResolvedValue([
      {
        createdAt: '2025-08-07T09:15:36.628Z',
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
    mockedGetHookAttempts.mockResolvedValue([
      {
        createdAt: '2025-08-07T09:15:36.628Z',
        failureReason: '',
        hookId: HOOK_ID,
        id: ATTEMPT_ID,
        inProgress: false,
        isFailure: false,
        messageId: MESSAGE_ID,
        projectId: 'test-project',
        resultCode: 200,
      } as DeliveryAttempt,
    ])

    await LogsHookCommand.run([TEST_HOOK.name])

    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Date: 2025-08-07T09:15:36.628Z')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Status: success')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Result code: 200')
    expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalledWith('Failures:')
  })

  test('displays error when hook message retrieval fails', async () => {
    mockedGetHooks.mockResolvedValue([TEST_HOOK])
    mockedGetHookMessages.mockRejectedValue(new Error('boom'))

    await LogsHookCommand.run([])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('Hook logs retrieval failed'),
      {
        exit: 1,
      },
    )
  })

  test('displays error when hook attempts retrieval fails', async () => {
    mockedGetHooks.mockResolvedValue([TEST_HOOK])
    mockedGetHookAttempts.mockRejectedValue(new Error('boom'))

    await LogsHookCommand.run([])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('Hook logs retrieval failed'),
      {
        exit: 1,
      },
    )
  })

  test('displays error when no hook is selected from prompt', async () => {
    const HOOK_ID_1 = 'no-select-hook-1-test'
    const HOOK_ID_2 = 'no-select-hook-2-test'

    uxMocks.select.mockResolvedValue('non-existent-hook-id')
    mockedGetHooks.mockResolvedValue([
      {
        id: HOOK_ID_1,
        name: 'first-hook',
        type: 'document',
      } as Hook,
      {
        id: HOOK_ID_2,
        name: 'second-hook',
        type: 'document',
      } as Hook,
    ])

    await LogsHookCommand.run([])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('No hook selected'),
      {
        exit: 1,
      },
    )
  })

  test('prompts user to select hook when multiple hooks exist', async () => {
    const HOOK_ID_1 = 'select-hook-test-1'
    const HOOK_ID_2 = 'select-hook-test-2'
    const MESSAGE_ID = 'select-msg-test'

    uxMocks.select.mockResolvedValue(HOOK_ID_2)
    mockedGetHooks.mockResolvedValue([
      {
        id: HOOK_ID_1,
        name: 'first-hook',
        type: 'document',
      } as Hook,
      {
        id: HOOK_ID_2,
        name: 'second-hook',
        type: 'document',
      } as Hook,
    ])
    mockedGetHookMessages.mockResolvedValue([
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
    mockedGetHookAttempts.mockResolvedValue([])

    await LogsHookCommand.run([])

    expect(uxMocks.select).toHaveBeenCalledWith({
      choices: [
        {name: 'first-hook', value: HOOK_ID_1},
        {name: 'second-hook', value: HOOK_ID_2},
      ],
      message: 'Select hook to list logs for',
    })

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Date: 2025-08-07T10:00:00.000Z')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Status: failure')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Result code: 500')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Failures: 1')
  })

  test('matches hook name case-insensitively', async () => {
    const HOOK_ID = 'case-hook-test'
    const MESSAGE_ID = 'case-msg-test'

    mockedGetHooks.mockResolvedValue([
      {
        id: HOOK_ID,
        name: 'Test-Hook',
        type: 'document',
      } as Hook,
    ])
    mockedGetHookMessages.mockResolvedValue([
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
    mockedGetHookAttempts.mockResolvedValue([])

    await LogsHookCommand.run(['test-hook'])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Date: 2025-08-07T11:00:00.000Z')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Status: success')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Result code: 200')
  })

  test('displays detailed output with --detailed flag', async () => {
    const HOOK_ID = 'detailed-hook-test'
    const MESSAGE_ID = 'detailed-msg-test'
    const ATTEMPT_TIMEOUT_ID = 'detailed-timeout-attempt-test'
    const ATTEMPT_PENDING_ID = 'detailed-pending-attempt-test'

    mockedGetHooks.mockResolvedValue([
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      } as Hook,
    ])
    mockedGetHookMessages.mockResolvedValue([
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
    mockedGetHookAttempts.mockResolvedValue([
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

    await LogsHookCommand.run(['--detailed'])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Date: 2025-08-07T13:00:00.000Z')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Status: failure')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Result code: 400')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Failures: 2')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Payload:')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('document'))
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('_type'))
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('post'))
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Attempts:')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('[2025-08-07T13:00:01Z]'),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Failure: Request timed out'),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('[2025-08-07T13:00:10Z]'),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Pending'))
  })

  test('displays detailed output with successful attempts', async () => {
    const HOOK_ID = 'success-detailed-hook-test'
    const MESSAGE_ID = 'success-detailed-msg-test'
    const ATTEMPT_ID = 'success-detailed-attempt-test'

    mockedGetHooks.mockResolvedValue([
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      } as Hook,
    ])
    mockedGetHookMessages.mockResolvedValue([
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
    mockedGetHookAttempts.mockResolvedValue([
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

    await LogsHookCommand.run(['--detailed'])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Date: 2025-08-07T14:00:00.000Z')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Status: success')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Result code: 201')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Payload:'))
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('{ success:'))
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('true'))
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Attempts:')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('[2025-08-07T14:00:01Z]'),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Success: HTTP 201 (250ms)'),
    )
  })

  test('displays message without attempts section when attempts array is empty', async () => {
    const HOOK_ID = 'empty-attempts-hook-test'
    const MESSAGE_ID = 'empty-attempts-msg-test'
    mockedGetHooks.mockResolvedValue([
      {
        id: HOOK_ID,
        name: 'test-hook',
        type: 'document',
      } as Hook,
    ])
    mockedGetHookMessages.mockResolvedValue([
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
    mockedGetHookAttempts.mockResolvedValue([])

    await LogsHookCommand.run(['--detailed'])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Date: 2025-08-07T17:00:00.000Z')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Status: queued')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Result code: 200')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Payload:')
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('{ no_attempts:'),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('true'))
    expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalledWith(expect.stringContaining('Attempts:')) // No attempts section when empty
  })
})
