import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {HOOK_API_VERSION} from '../../../actions/hook/constants.js'
import {type DeliveryAttempt} from '../../../actions/hook/types.js'
import {AttemptHookCommand} from '../attempt.js'

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

describe('#attempt', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('displays successful delivery attempt details', async () => {
    const mockAttempt: DeliveryAttempt = {
      createdAt: '2023-01-01T12:00:00Z',
      duration: 1500,
      failureReason: '',
      hookId: 'hook123',
      id: 'attempt123',
      inProgress: false,
      isFailure: false,
      messageId: 'msg123',
      projectId: 'proj123',
      resultBody: 'Success response body',
      resultCode: 200,
      updatedAt: '2023-01-01T12:00:01Z',
    }

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project/attempts/attempt123',
    }).reply(200, mockAttempt)

    const {stdout} = await testCommand(AttemptHookCommand, ['attempt123'], {mocks: defaultMocks})

    expect(stdout).toContain('Date: 2023-01-01T12:00:00Z')
    expect(stdout).toContain('Status: Delivered')
    expect(stdout).toContain('Status code: 200')
    expect(stdout).toContain('Response body:')
    expect(stdout).toContain('Success response body')
  })

  test('displays failed delivery attempt with HTTP error', async () => {
    const mockAttempt: DeliveryAttempt = {
      createdAt: '2023-01-01T12:00:00Z',
      duration: 500,
      failureReason: 'http',
      hookId: 'hook123',
      id: 'attempt123',
      inProgress: false,
      isFailure: true,
      messageId: 'msg123',
      projectId: 'proj123',
      resultBody: 'Error response body',
      resultCode: 404,
      updatedAt: '2023-01-01T12:00:01Z',
    }

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project/attempts/attempt123',
    }).reply(200, mockAttempt)

    const {stdout} = await testCommand(AttemptHookCommand, ['attempt123'], {mocks: defaultMocks})

    expect(stdout).toContain('Date: 2023-01-01T12:00:00Z')
    expect(stdout).toContain('Status: Failed')
    expect(stdout).toContain('Status code: 404')
    expect(stdout).toContain('Failure: HTTP 404')
    expect(stdout).toContain('Response body:')
    expect(stdout).toContain('Error response body')
  })

  test('displays failed delivery attempt with network error', async () => {
    const mockAttempt: DeliveryAttempt = {
      createdAt: '2023-01-01T12:00:00Z',
      duration: null,
      failureReason: 'network',
      hookId: 'hook123',
      id: 'attempt123',
      inProgress: false,
      isFailure: true,
      messageId: 'msg123',
      projectId: 'proj123',
      resultBody: '',
      resultCode: 0,
      updatedAt: '2023-01-01T12:00:01Z',
    }

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project/attempts/attempt123',
    }).reply(200, mockAttempt)

    const {stdout} = await testCommand(AttemptHookCommand, ['attempt123'], {mocks: defaultMocks})

    expect(stdout).toContain('Date: 2023-01-01T12:00:00Z')
    expect(stdout).toContain('Status: Failed')
    expect(stdout).toContain('Status code: 0')
    expect(stdout).toContain('Failure: Network error')
    expect(stdout).not.toContain('Response body:')
  })

  test('displays failed delivery attempt with timeout', async () => {
    const mockAttempt: DeliveryAttempt = {
      createdAt: '2023-01-01T12:00:00Z',
      duration: null,
      failureReason: 'timeout',
      hookId: 'hook123',
      id: 'attempt123',
      inProgress: false,
      isFailure: true,
      messageId: 'msg123',
      projectId: 'proj123',
      resultBody: '',
      resultCode: 0,
      updatedAt: '2023-01-01T12:00:01Z',
    }

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project/attempts/attempt123',
    }).reply(200, mockAttempt)

    const {stdout} = await testCommand(AttemptHookCommand, ['attempt123'], {mocks: defaultMocks})

    expect(stdout).toContain('Date: 2023-01-01T12:00:00Z')
    expect(stdout).toContain('Status: Failed')
    expect(stdout).toContain('Status code: 0')
    expect(stdout).toContain('Failure: Request timed out')
    expect(stdout).not.toContain('Response body:')
  })

  test('displays in-progress delivery attempt', async () => {
    const mockAttempt: DeliveryAttempt = {
      createdAt: '2023-01-01T12:00:00Z',
      duration: null,
      failureReason: '',
      hookId: 'hook123',
      id: 'attempt123',
      inProgress: true,
      isFailure: false,
      messageId: 'msg123',
      projectId: 'proj123',
      resultBody: '',
      resultCode: 0,
      updatedAt: null,
    }

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project/attempts/attempt123',
    }).reply(200, mockAttempt)

    const {stdout} = await testCommand(AttemptHookCommand, ['attempt123'], {mocks: defaultMocks})

    expect(stdout).toContain('Date: 2023-01-01T12:00:00Z')
    expect(stdout).toContain('Status: In progress')
    expect(stdout).toContain('Status code: 0')
    expect(stdout).not.toContain('Failure:')
    expect(stdout).not.toContain('Response body:')
  })

  test('handles empty response body', async () => {
    const mockAttempt: DeliveryAttempt = {
      createdAt: '2023-01-01T12:00:00Z',
      duration: 1000,
      failureReason: '',
      hookId: 'hook123',
      id: 'attempt123',
      inProgress: false,
      isFailure: false,
      messageId: 'msg123',
      projectId: 'proj123',
      resultBody: '',
      resultCode: 204,
      updatedAt: '2023-01-01T12:00:01Z',
    }

    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project/attempts/attempt123',
    }).reply(200, mockAttempt)

    const {stdout} = await testCommand(AttemptHookCommand, ['attempt123'], {mocks: defaultMocks})

    expect(stdout).toContain('Date: 2023-01-01T12:00:00Z')
    expect(stdout).toContain('Status: Delivered')
    expect(stdout).toContain('Status code: 204')
    expect(stdout).toContain('Response body: <empty>')
  })

  test('displays error when API request fails', async () => {
    mockApi({
      apiVersion: HOOK_API_VERSION,
      uri: '/hooks/projects/test-project/attempts/attempt123',
    }).reply(404, {message: 'Attempt not found'})

    const {error} = await testCommand(AttemptHookCommand, ['attempt123'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Hook attempt retrieval failed')
  })

  test('requires attempt ID argument', async () => {
    const {error} = await testCommand(AttemptHookCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing 1 required arg')
  })

  test('throws error when no project ID is found', async () => {
    const {error} = await testCommand(AttemptHookCommand, ['attempt123'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
  })
})
