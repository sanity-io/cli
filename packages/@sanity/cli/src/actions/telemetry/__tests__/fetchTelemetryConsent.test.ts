import {getUserConfig} from '@sanity/cli-core'
import {mockApi} from '@sanity/cli-test'
import {beforeEach, describe, expect, test} from 'vitest'

import {fetchTelemetryConsent, TELEMETRY_CONSENT_CONFIG_KEY} from '../fetchTelemetryConsent.js'

describe('#fetchTelemetryConsent', () => {
  beforeEach(() => {
    const userConfig = getUserConfig()
    userConfig.delete(TELEMETRY_CONSENT_CONFIG_KEY)
  })

  test('should return the telemetry consent status', async () => {
    mockApi({
      apiVersion: 'v2025-08-14',
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'granted'})
    const consent = await fetchTelemetryConsent()

    expect(consent).toEqual({status: 'granted'})
  })
})
