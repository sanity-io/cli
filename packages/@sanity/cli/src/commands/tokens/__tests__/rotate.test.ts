import {Readable} from 'node:stream'

import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../../actions/tokens/constants.js'
import {RotateTokenCommand} from '../rotate.js'

const defaultMocks = {
  token: 'test-token',
}

const rotatedRobot = {
  createdAt: '2023-01-01T00:00:00Z',
  expiresAt: '2030-01-01T00:00:00.000Z',
  id: 'robot-rotated',
  label: 'CI Token',
  memberships: [
    {
      resourceId: 'test-project',
      resourceType: 'project',
      roleNames: ['editor'],
    },
  ],
  token: 'sk_new_secret',
  tokenId: 'robot-rotated-new-token',
}

const originalStdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin')
type MockStdin = Readable & {isTTY?: boolean}

function mockStdin(input: string, options: {isTTY?: boolean} = {}) {
  const stdin: MockStdin = Readable.from([input])
  stdin.isTTY = options.isTTY

  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: stdin,
  })
}

describe('#tokens:rotate', () => {
  beforeEach(() => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'production')
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    if (originalStdinDescriptor) {
      Object.defineProperty(process, 'stdin', originalStdinDescriptor)
    }
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('rotates the token piped on standard input', async () => {
    mockStdin('sk_old_secret\n')

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/robots/me/rotate',
    }).reply(200, rotatedRobot)

    const {error, stdout} = await testCommand(RotateTokenCommand, [], {mocks: defaultMocks})

    expect(error).toBeUndefined()
    expect(stdout).toContain('API token rotated')
    expect(stdout).toContain('Label: CI Token')
    expect(stdout).toContain('ID: robot-rotated')
    expect(stdout).toContain('Expires: 2030-01-01T00:00:00.000Z')
    expect(stdout).toContain('Token: sk_new_secret')
    expect(stdout).toContain("Copy the token now. It won't be shown again.")
    expect(stdout).toContain('The previous token was revoked and no longer works.')
  })

  test('rotates a token passed with --token', async () => {
    mockStdin('', {isTTY: true})

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/robots/me/rotate',
    }).reply(200, rotatedRobot)

    const {error, stdout} = await testCommand(RotateTokenCommand, ['--token', 'sk_old_secret'], {
      mocks: defaultMocks,
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain('API token rotated')
  })

  test('outputs the rotated robot as JSON', async () => {
    mockStdin('sk_old_secret\n')

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/robots/me/rotate',
    }).reply(200, rotatedRobot)

    const {stdout} = await testCommand(RotateTokenCommand, ['--json'], {mocks: defaultMocks})

    expect(JSON.parse(stdout)).toEqual(rotatedRobot)
  })

  test('requires a token when stdin is a TTY', async () => {
    mockStdin('', {isTTY: true})

    const {error} = await testCommand(RotateTokenCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token is required')
    expect(error?.message).toContain('sanity tokens rotate')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('rejects empty standard input', async () => {
    mockStdin('  \n')

    const {error} = await testCommand(RotateTokenCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token is required')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('explains a 401 as an invalid or already-rotated token', async () => {
    mockStdin('sk_old_secret\n')

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/robots/me/rotate',
    }).reply(401, {message: 'Unauthorized'})

    const {error} = await testCommand(RotateTokenCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('invalid, expired, or was already rotated or revoked')
    expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
  })

  test('explains a 403 as a non-API token', async () => {
    mockStdin('sk_personal_token\n')

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/robots/me/rotate',
    }).reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(RotateTokenCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('is not an API token and cannot be rotated')
    expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
  })

  test('handles other API errors', async () => {
    mockStdin('sk_old_secret\n')

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/robots/me/rotate',
    }).reply(429, {message: 'Too many requests'})

    const {error} = await testCommand(RotateTokenCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token rotation failed')
    expect(error?.message).toContain('Too many requests')
    expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
  })
})
