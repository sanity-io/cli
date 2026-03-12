import {getUserConfig} from '@sanity/cli-core'
import {mockApi} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  fetchTelemetryConsent,
  TELEMETRY_API_VERSION,
  TELEMETRY_CONSENT_CONFIG_KEY,
} from '../telemetry.js'

/** In-memory config store compatible with the ConfigStoreApi interface used by createExpiringConfig */
function createInMemoryConfigStore() {
  const store = new Map<string, unknown>()
  return {
    delete: (key: string) => store.delete(key),
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
  }
}

const testConfigStore = createInMemoryConfigStore()

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getUserConfig: vi.fn(() => testConfigStore),
  }
})

describe('#fetchTelemetryConsent', () => {
  beforeEach(() => {
    const userConfig = getUserConfig()
    userConfig.delete(TELEMETRY_CONSENT_CONFIG_KEY)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should return the telemetry consent status', async () => {
    mockApi({
      apiVersion: TELEMETRY_API_VERSION,
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'granted'})
    const consent = await fetchTelemetryConsent()

    expect(consent).toEqual({status: 'granted'})
  })
})
