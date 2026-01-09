import {runCommand} from '@oclif/test'
import {getCliToken, isCi} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {fetchTelemetryConsent} from '../../../actions/telemetry/fetchTelemetryConsent.js'
import {type ValidApiConsentStatus} from '../../../actions/telemetry/isValidApiConsentStatus.js'
import {Status} from '../status.js'

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

const mockGetCliToken = vi.mocked(getCliToken)
const mockFetchTelemetryConsent = vi.mocked(fetchTelemetryConsent)
const mockIsCi = vi.mocked(isCi)

describe('telemetry status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('help text is correct', async () => {
    const {stdout} = await runCommand(['telemetry', 'status', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Check telemetry consent status for your logged in user

      USAGE
        $ sanity telemetry status

      DESCRIPTION
        Check telemetry consent status for your logged in user

      EXAMPLES
        Check telemetry consent status for your logged in user

          $ sanity telemetry telemetry status

      "
    `)
  })

  test('command handles no flags correctly', async () => {
    const {error} = await testCommand(Status, ['--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })

  test('shows disabled status with DO_NOT_TRACK environment variable', async () => {
    // Set DO_NOT_TRACK environment variable
    vi.stubEnv('DO_NOT_TRACK', '1')

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('Status: Disabled')
    expect(stdout).toContain("You've opted out of telemetry data collection.")
    expect(stdout).toContain('No data will be collected from your machine.')
    expect(stdout).toContain('Using DO_NOT_TRACK environment variable.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('shows status when DO_NOT_TRACK is not set', async () => {
    // Explicitly ensure DO_NOT_TRACK is not set
    vi.stubEnv('DO_NOT_TRACK', undefined)

    const {stdout} = await testCommand(Status, [])

    // Should show telemetry status or appropriate message
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('shows cannot set message in CI environment', async () => {
    mockGetCliToken.mockResolvedValue('test-token')

    mockIsCi.mockReturnValueOnce(true)

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('Status: Disabled')
  })

  // Additional tests for better coverage (using working patterns)
  test('ensures unauthenticated case works when no token available', async () => {
    // Mock no authentication token
    mockGetCliToken.mockResolvedValue(undefined)

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('You need to log in first to see telemetry status.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  // Integration tests with API mocking for different status responses
  test('shows granted status when API returns granted', async () => {
    mockGetCliToken.mockResolvedValue('test-token')

    mockFetchTelemetryConsent.mockResolvedValue({status: 'granted'})

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('Status: Enabled')
    expect(stdout).toContain(
      'Telemetry data on general usage and errors is collected to help us improve Sanity.',
    )
    expect(stdout).toContain('Learn more about the data being collected here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('shows unset status when API returns unset', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    mockFetchTelemetryConsent.mockResolvedValue({status: 'unset'})

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('Status: Not set')
    expect(stdout).toContain("You've not set your preference for telemetry collection.")
    expect(stdout).toContain("Run 'npx sanity telemetry enable/disable' to opt in or out.")
    expect(stdout).toContain('You can also use the DO_NOT_TRACK environment variable to opt out.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('shows denied status when API returns denied (without local override)', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    mockFetchTelemetryConsent.mockResolvedValue({status: 'denied'})

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('Status: Disabled')
    expect(stdout).toContain("You've opted out of telemetry data collection.")
    expect(stdout).toContain('No data will be collected from your Sanity account.')
    expect(stdout).not.toContain('Using DO_NOT_TRACK environment variable.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('shows fetch error when API call fails', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock the telemetry status API to return an error
    mockFetchTelemetryConsent.mockRejectedValue(new Error('API error'))

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('Could not fetch telemetry consent status.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('handles invalid API response gracefully', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    mockFetchTelemetryConsent.mockResolvedValue({status: 'invalid-status' as ValidApiConsentStatus})

    const {stdout} = await testCommand(Status, [])

    // Invalid API response should be handled as a fetch error
    expect(stdout).toContain('Could not fetch telemetry consent status.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })
})
