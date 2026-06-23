import {getCliToken} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {Enable} from '../../../../src/commands/telemetry/enable.js'
import {fetchTelemetryConsent} from '../../../../src/services/telemetry.js'

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    getCliToken: vi.fn(),
    isCi: () => false,
  }
})

vi.mock('../../../../src/services/telemetry.js', async () => ({
  ...(await vi.importActual('../../../../src/services/telemetry.js')),
  fetchTelemetryConsent: vi.fn(),
}))

const mockGetCliToken = vi.mocked(getCliToken)
const mockFetchTelemetryConsent = vi.mocked(fetchTelemetryConsent)

describe('#enable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('shows already enabled message when telemetry is already granted', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    mockFetchTelemetryConsent.mockResolvedValueOnce({status: 'granted'})

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
    vi.stubEnv('DO_NOT_TRACK', '1')

    const {stdout} = await testCommand(Enable, [])

    expect(stdout).toContain(
      'Cannot enable telemetry while DO_NOT_TRACK environment variable is set. Unset DO_NOT_TRACK to enable telemetry.',
    )
  })

  test('shows error message when API call fails with 403', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock current status as denied
    mockFetchTelemetryConsent.mockResolvedValueOnce({status: 'denied'})

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

    mockFetchTelemetryConsent.mockResolvedValueOnce({status: 'denied'})

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
})
