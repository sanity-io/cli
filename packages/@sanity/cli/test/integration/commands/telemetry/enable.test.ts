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
