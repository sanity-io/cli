import {type InitializedClientConfig} from '@sanity/client'
import {type Mock, vi} from 'vitest'

const noop = () => {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noopRequester = noop as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noopResolveFetch = (() => noop) as any

/**
 * Builds a client config shaped like the one a real `@sanity/client` instance
 * hands back from `client.config()`.
 *
 * This matters beyond realism: `createClient()` always populates
 * `requestHandler`, `requester` and `resolveFetch` with functions, and the CLI
 * layers its own request handler on top of whatever the caller passed. A mock
 * that returns a plain, function-free object lets code which cannot survive a
 * real client config - anything that sends the config across a worker boundary,
 * for instance - pass a test it would fail in production.
 *
 * @internal
 */
export function createMockClientConfig(
  overrides: Partial<InitializedClientConfig> = {},
): InitializedClientConfig {
  return {
    apiHost: 'https://api.sanity.io',
    apiVersion: '2025-02-19',
    cdnUrl: 'https://api.sanity.io/v2025-02-19',
    ignoreBrowserTokenWarning: true,
    isDefaultApi: true,
    requester: noopRequester,
    requestHandler: async (request, next) => next(request),
    requestTagPrefix: 'sanity.cli',
    resolveFetch: noopResolveFetch,
    stega: {enabled: false},
    token: 'test-token',
    url: 'https://api.sanity.io/v2025-02-19',
    useCdn: false,
    useProjectHostname: false,
    ...overrides,
  }
}

/**
 * A stand-in for the client object `getGlobalCliClient()` and
 * `getProjectCliClient()` resolve to. Only `config()` is implemented; spread the
 * result and add whatever else a given test needs.
 *
 * @internal
 */
export function createMockCliClient(configOverrides: Partial<InitializedClientConfig> = {}): {
  config: Mock<() => InitializedClientConfig>
} {
  return {config: vi.fn(() => createMockClientConfig(configOverrides))}
}

/** @internal */
export const getGlobalCliClient: Mock = vi.fn(async () => createMockCliClient())
/** @internal */
export const getProjectCliClient: Mock = vi.fn(async () => createMockCliClient())
