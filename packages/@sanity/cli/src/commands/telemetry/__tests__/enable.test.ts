import {runCommand} from '@oclif/test'
import {getCliToken, getUserConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {Enable} from '../enable.js'

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn(),
}))

const mockGetCliToken = vi.mocked(getCliToken)

describe('telemetry enable', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment to clean state
    process.env = {...originalEnv}
    vi.clearAllMocks()

    // Clear telemetry consent cache to ensure fresh API calls
    const userConfig = getUserConfig()
    userConfig.delete('telemetryConsent')
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('help text is correct', async () => {
    const {stdout} = await runCommand(['telemetry', 'enable', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Enable telemetry for your logged in user

      USAGE
        $ sanity telemetry enable

      DESCRIPTION
        Enable telemetry for your logged in user

      EXAMPLES
        Enable telemetry for your logged in user

          $ sanity telemetry telemetry enable

      "
    `)
  })

  test('enables telemetry when user is authenticated and status is different', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock current status as denied
    mockApi({
      apiVersion: 'v2023-12-18',
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'denied'})

    // Mock enable API call
    mockApi({
      apiVersion: 'v2023-12-18',
      method: 'put',
      uri: '/users/me/consents/telemetry/status/granted',
    }).reply(200)

    // Mock updated status fetch
    mockApi({
      apiVersion: 'v2023-12-18',
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'granted'})

    const {stdout} = await testCommand(Enable, [])

    expect(stdout).toContain(
      "You've now enabled telemetry data collection to help us improve Sanity.",
    )
    expect(stdout).toContain('Learn more about the data being collected here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('shows already enabled message when telemetry is already granted', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock current status as already granted
    mockApi({
      apiVersion: 'v2023-12-18',
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'granted'})

    const {stdout} = await testCommand(Enable, [])

    expect(stdout).toContain(
      "You've already enabled telemetry data collection to help us improve Sanity.",
    )
    expect(stdout).not.toContain('Learn more about the data being collected here:')
  })

  test('shows login required message when user is not authenticated', async () => {
    // User is not authenticated
    mockGetCliToken.mockResolvedValue(undefined)

    const {stdout} = await testCommand(Enable, [])

    expect(stdout).toContain('You need to log in first to set telemetry preferences.')
  })

  test('shows error when DO_NOT_TRACK is set and trying to enable', async () => {
    // Set DO_NOT_TRACK environment variable
    process.env.DO_NOT_TRACK = '1'

    const {stdout} = await testCommand(Enable, [])

    expect(stdout).toContain(
      'Cannot enable telemetry while DO_NOT_TRACK environment variable is set. Unset DO_NOT_TRACK to enable telemetry.',
    )
  })

  test('shows error message when API call fails with 403', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock current status as denied
    mockApi({
      apiVersion: 'v2023-12-18',
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'denied'})

    // Mock enable API call to fail with 403
    mockApi({
      apiVersion: 'v2023-12-18',
      method: 'put',
      uri: '/users/me/consents/telemetry/status/granted',
    }).reply(403, {message: 'Permission denied'})

    const result = await testCommand(Enable, [])

    expect(result.error).toMatchObject({
      message: 'Failed to enable telemetry: Permission denied',
    })
  })

  test('shows error message when API call fails with other error', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock current status as denied
    mockApi({
      apiVersion: 'v2023-12-18',
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'denied'})

    // Mock enable API call to fail with 500
    mockApi({
      apiVersion: 'v2023-12-18',
      method: 'put',
      uri: '/users/me/consents/telemetry/status/granted',
    }).reply(500, {message: 'Internal server error'})

    const result = await testCommand(Enable, [])

    expect(result.error).toMatchObject({
      message: 'Failed to enable telemetry: Internal server error',
    })
  })

  test('shows cannot set message in CI environment', async () => {
    // Mock isCi as true for this test
    vi.doMock('../../../../../cli-core/src/util/isCi.js', () => ({
      isCi: true,
    }))

    // Re-import modules to use the mocked isCi value
    vi.resetModules()
    const {setConsent} = await import('../../../actions/telemetry/setConsent.js')

    const result = await setConsent({
      env: process.env,
      status: 'granted',
    })

    expect(result.message).toContain('Cannot set telemetry consent in CI environment')
  })
})
