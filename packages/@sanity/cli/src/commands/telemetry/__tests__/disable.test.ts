import {runCommand} from '@oclif/test'
import * as cliCore from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {fetchTelemetryConsent} from '../../../actions/telemetry/fetchTelemetryConsent.js'
import {Disable} from '../disable.js'

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    getCliToken: vi.fn(),
    isCi: vi.fn(() => false),
  }
})

vi.mock('../../../actions/telemetry/fetchTelemetryConsent.js', () => ({
  fetchTelemetryConsent: vi.fn(),
}))

const mockGetCliToken = vi.mocked(cliCore.getCliToken)
const mockFetchTelemetryConsent = vi.mocked(fetchTelemetryConsent)
const mockIsCi = vi.mocked(cliCore.isCi)

describe('#disable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('help text is correct', async () => {
    const {stdout} = await runCommand(['telemetry', 'disable', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Disable telemetry for your logged in user

      USAGE
        $ sanity telemetry disable

      DESCRIPTION
        Disable telemetry for your logged in user

      EXAMPLES
        Disable telemetry for your logged in user

          $ sanity telemetry telemetry disable

      "
    `)
  })

  test('disables telemetry when user is authenticated and status is different', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock current status as granted
    mockFetchTelemetryConsent.mockResolvedValueOnce({status: 'granted'})

    // Mock disable API call
    mockApi({
      apiVersion: 'v2023-12-18',
      method: 'put',
      uri: '/users/me/consents/telemetry/status/denied',
    }).reply(200)

    // Mock updated status fetch
    mockFetchTelemetryConsent.mockResolvedValueOnce({status: 'denied'})

    const {stdout} = await testCommand(Disable, [])

    expect(stdout).toContain(
      "You've opted out of telemetry data collection.\nNo data will be collected from your Sanity account.",
    )
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('shows already disabled message when telemetry is already denied', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock current status as already denied
    mockFetchTelemetryConsent.mockResolvedValueOnce({status: 'denied'})

    const {stdout} = await testCommand(Disable, [])

    expect(stdout).toContain(
      "You've already opted out of telemetry data collection.\nNo data is collected from your Sanity account.",
    )
    expect(stdout).not.toContain('Learn more here:')
  })

  test('shows already disabled message with DO_NOT_TRACK when local override is active', async () => {
    // Set DO_NOT_TRACK environment variable
    vi.stubEnv('DO_NOT_TRACK', '1')

    const {stdout} = await testCommand(Disable, [])

    expect(stdout).toContain(
      "You've already opted out of telemetry data collection.\nNo data is collected from your machine.\n\nUsing DO_NOT_TRACK environment variable.",
    )
  })

  test('shows cannot set message in CI environment', async () => {
    mockIsCi.mockReturnValue(true)

    mockFetchTelemetryConsent.mockResolvedValueOnce({status: 'granted'})

    const {stdout} = await testCommand(Disable, [])

    expect(stdout).toContain('Cannot set telemetry consent in CI environment')
    mockIsCi.mockRestore()
  })

  test('shows login required message when user is not authenticated', async () => {
    // User is not authenticated
    mockGetCliToken.mockResolvedValue(undefined)

    const {stdout} = await testCommand(Disable, [])

    expect(stdout).toContain('You need to log in first to set telemetry preferences.')
  })

  test('shows error message when API call fails with 403', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock current status as granted
    mockFetchTelemetryConsent.mockResolvedValueOnce({status: 'granted'})

    // Mock disable API call to fail with 403
    mockApi({
      apiVersion: 'v2023-12-18',
      method: 'put',
      uri: '/users/me/consents/telemetry/status/denied',
    }).reply(403, {message: 'Permission denied'})

    const result = await testCommand(Disable, [])

    expect(result.error).toMatchObject({
      message: 'Failed to disable telemetry: Permission denied',
    })
  })

  test('shows error message when API call fails with other error', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock current status as granted
    mockFetchTelemetryConsent.mockResolvedValueOnce({status: 'granted'})

    // Mock disable API call to fail with 500
    mockApi({
      apiVersion: 'v2023-12-18',
      method: 'put',
      uri: '/users/me/consents/telemetry/status/denied',
    }).reply(500, {message: 'Internal server error'})

    const result = await testCommand(Disable, [])

    expect(result.error).toMatchObject({
      message: 'Failed to disable telemetry: Internal server error',
    })
  })
})
