import nock from 'nock'

/**
 * @internal
 */
export interface MockApiOptions {
  /**
   * Uri to mock
   */
  uri: string

  /**
   * Api host to mock, defaults to `https://api.sanity.io`
   */
  apiHost?: string

  /**
   * Api version to mock, defaults to `v2025-05-14`
   */
  apiVersion?: string

  /**
   * Query parameters to mock
   */
  query?: Record<string, string>
}

/**
 * Mocks the API calls, add some defaults so it doesn't cause too much friction
 *
 * @internal
 */
export function mockApi({
  apiHost = 'https://api.sanity.io',
  apiVersion = 'v2025-05-14',
  query = {},
  uri,
}: MockApiOptions) {
  return nock(apiHost)
    .get(`/${apiVersion}${uri}`)
    .query({tag: 'sanity.cli', ...query})
}
