import {getUserConfig} from '@sanity/cli-core'
import {mockApi} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  fetchTelemetryConsent,
  getTelemetryConsentCacheKey,
  TELEMETRY_API_VERSION,
  TELEMETRY_CONSENT_CONFIG_KEY,
} from '../telemetry.js'

/** In-memory config store compatible with the ConfigStoreApi interface used by createExpiringConfig */
function createInMemoryConfigStore() {
  const store = new Map<string, unknown>()
  return {
    clear: () => store.clear(),
    delete: (key: string) => store.delete(key),
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
  }
}

const testConfigStore = createInMemoryConfigStore()

const mockGetCliToken = vi.hoisted(() => vi.fn<() => Promise<string | undefined>>())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getCliToken: mockGetCliToken,
    getUserConfig: vi.fn(() => testConfigStore),
  }
})

describe('#getTelemetryConsentCacheKey', () => {
  test('returns base key when no token is provided', () => {
    expect(getTelemetryConsentCacheKey(undefined)).toBe(TELEMETRY_CONSENT_CONFIG_KEY)
  })

  test('returns token-scoped key when a token is provided', () => {
    const key = getTelemetryConsentCacheKey('test-token-abc')
    expect(key).toMatch(new RegExp(`^${TELEMETRY_CONSENT_CONFIG_KEY}:[a-f0-9]{12}$`))
  })

  test('returns different keys for different tokens', () => {
    const keyA = getTelemetryConsentCacheKey('token-user-a')
    const keyB = getTelemetryConsentCacheKey('token-user-b')
    expect(keyA).not.toBe(keyB)
  })

  test('returns the same key for the same token', () => {
    const key1 = getTelemetryConsentCacheKey('same-token')
    const key2 = getTelemetryConsentCacheKey('same-token')
    expect(key1).toBe(key2)
  })
})

describe('#fetchTelemetryConsent', () => {
  beforeEach(() => {
    getUserConfig().clear()
    mockGetCliToken.mockResolvedValue('test-token')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should return the telemetry consent status', async () => {
    mockGetCliToken.mockResolvedValue('test-token')
    mockApi({
      apiVersion: TELEMETRY_API_VERSION,
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'granted'})
    const consent = await fetchTelemetryConsent()

    expect(consent).toEqual({status: 'granted'})
  })

  test('should cache consent under a token-scoped key', async () => {
    mockGetCliToken.mockResolvedValue('test-token')
    mockApi({
      apiVersion: TELEMETRY_API_VERSION,
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'granted'})

    await fetchTelemetryConsent()

    const scopedKey = getTelemetryConsentCacheKey('test-token')
    const cached = getUserConfig().get(scopedKey) as {value: {status: string}} | undefined
    expect(cached?.value).toEqual({status: 'granted'})
  })

  test('should not reuse cache from a different token', async () => {
    // Fetch and cache consent for token A
    mockGetCliToken.mockResolvedValue('token-a')
    mockApi({
      apiVersion: TELEMETRY_API_VERSION,
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'denied'})

    const consentA = await fetchTelemetryConsent()
    expect(consentA).toEqual({status: 'denied'})

    // Now switch to token B - should make a new API call, not reuse token A's cache
    mockGetCliToken.mockResolvedValue('token-b')
    mockApi({
      apiVersion: TELEMETRY_API_VERSION,
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'granted'})

    const consentB = await fetchTelemetryConsent()
    expect(consentB).toEqual({status: 'granted'})
  })

  test('should use base key when no token is available', async () => {
    mockGetCliToken.mockResolvedValue(undefined)
    mockApi({
      apiVersion: TELEMETRY_API_VERSION,
      query: {tag: 'sanity.cli.telemetry-consent'},
      uri: '/intake/telemetry-status',
    }).reply(200, {status: 'unset'})

    const consent = await fetchTelemetryConsent()
    expect(consent).toEqual({status: 'unset'})

    // Should be cached under the base key
    const cached = getUserConfig().get(TELEMETRY_CONSENT_CONFIG_KEY) as
      | {value: {status: string}}
      | undefined
    expect(cached?.value).toEqual({status: 'unset'})
  })
})
