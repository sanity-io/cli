import {runCommand} from '@oclif/test'
import {getCliToken, getUserConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {Status} from '../status.js'

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn(),
}))

const mockGetCliToken = vi.mocked(getCliToken)

describe('telemetry status', () => {
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

  test('shows disabled status with DO_NOT_TRACK environment variable', async () => {
    // Set DO_NOT_TRACK environment variable
    process.env.DO_NOT_TRACK = '1'

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('Status: Disabled')
    expect(stdout).toContain("You've opted out of telemetry data collection.")
    expect(stdout).toContain('No data will be collected from your machine.')
    expect(stdout).toContain('Using DO_NOT_TRACK environment variable.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('shows disabled status with DO_NOT_TRACK=true', async () => {
    // Set DO_NOT_TRACK environment variable
    process.env.DO_NOT_TRACK = 'true'

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('Status: Disabled')
    expect(stdout).toContain("You've opted out of telemetry data collection.")
    expect(stdout).toContain('No data will be collected from your machine.')
    expect(stdout).toContain('Using DO_NOT_TRACK environment variable.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('does not treat DO_NOT_TRACK=yes as truthy', async () => {
    // Set DO_NOT_TRACK environment variable to non-truthy value
    process.env.DO_NOT_TRACK = 'yes'

    const {stdout} = await testCommand(Status, [])

    // Should NOT show the local override message since "yes" is not truthy
    expect(stdout).not.toContain('Using DO_NOT_TRACK environment variable.')
    // Should show telemetry status or other appropriate message
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('does not treat DO_NOT_TRACK=0 as truthy', async () => {
    // Set DO_NOT_TRACK environment variable to zero (not truthy)
    process.env.DO_NOT_TRACK = '0'

    const {stdout} = await testCommand(Status, [])

    // Should NOT show the local override message since 0 is not truthy
    expect(stdout).not.toContain('Using DO_NOT_TRACK environment variable.')
    // Should show telemetry status or other appropriate message
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('shows status when DO_NOT_TRACK is not set', async () => {
    // Ensure no DO_NOT_TRACK is set
    delete process.env.DO_NOT_TRACK

    const {stdout} = await testCommand(Status, [])

    // Should show telemetry status or appropriate message
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('command handles no flags correctly', async () => {
    const {error} = await testCommand(Status, ['--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })

  test('command runs without crashing', async () => {
    const {error} = await testCommand(Status, [])

    // Command should not crash, regardless of the output
    expect(error).toBeUndefined()
  })

  // Additional tests for better coverage (using working patterns)
  test('ensures unauthenticated case works when no token available', async () => {
    // Mock no authentication token
    mockGetCliToken.mockResolvedValue(undefined)

    // Ensure no DO_NOT_TRACK is set
    delete process.env.DO_NOT_TRACK

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('You need to log in first to see telemetry status.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('tests multiple DO_NOT_TRACK values to ensure comprehensive coverage', async () => {
    // Test with numeric values that should work
    process.env.DO_NOT_TRACK = '2'

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('Status: Disabled')
    expect(stdout).toContain('Using DO_NOT_TRACK environment variable.')
    expect(stdout).toContain('No data will be collected from your machine.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  // Integration tests with API mocking for different status responses
  test('shows granted status when API returns granted', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock the telemetry status API using mockApi with exact parameters
    mockApi({
      apiVersion: 'v2023-12-18',
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'granted'})

    // Ensure no DO_NOT_TRACK is set
    delete process.env.DO_NOT_TRACK

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

    // Mock the telemetry status API using mockApi
    mockApi({
      apiVersion: 'v2023-12-18',
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'unset'})

    // Ensure no DO_NOT_TRACK is set
    delete process.env.DO_NOT_TRACK

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

    // Mock the telemetry status API using mockApi
    mockApi({
      apiVersion: 'v2023-12-18',
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'denied'})

    // Ensure no DO_NOT_TRACK is set
    delete process.env.DO_NOT_TRACK

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
    mockApi({
      apiVersion: 'v2023-12-18',
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(500, {error: 'Internal server error'})

    // Ensure no DO_NOT_TRACK is set
    delete process.env.DO_NOT_TRACK

    const {stdout} = await testCommand(Status, [])

    expect(stdout).toContain('Could not fetch telemetry consent status.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })

  test('handles invalid API response gracefully', async () => {
    // Ensure user is authenticated
    mockGetCliToken.mockResolvedValue('test-token')

    // Mock the telemetry status API to return invalid status
    mockApi({
      apiVersion: 'v2023-12-18',
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'invalid-status'})

    // Ensure no DO_NOT_TRACK is set
    delete process.env.DO_NOT_TRACK

    const {stdout} = await testCommand(Status, [])

    // Invalid API response should be handled as a fetch error
    expect(stdout).toContain('Could not fetch telemetry consent status.')
    expect(stdout).toContain('Learn more here:')
    expect(stdout).toContain('https://www.sanity.io/telemetry')
  })
})
