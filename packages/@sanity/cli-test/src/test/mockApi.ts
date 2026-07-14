import nock from 'nock'
import {afterEach, expect} from 'vitest'

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
   * Whether to include `tag: 'sanity.cli'` in query parameters.
   * Defaults to `true`. Set to `false` for endpoints that don't use CLI tagging.
   */
  includeQueryTag?: boolean

  /**
   * HTTP method to mock
   *
   * Defaults to 'get'
   */
  method?: 'delete' | 'get' | 'patch' | 'post' | 'put'

  /**
   * Project ID to mock. When provided, constructs apiHost as `https://{projectId}.api.sanity.io`
   * Takes precedence over apiHost if both are provided.
   */
  projectId?: string

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
  includeQueryTag = true,
  method = 'get',
  projectId,
  query = {},
  uri,
}: MockApiOptions) {
  const version = apiVersion.startsWith('v') ? apiVersion : `v${apiVersion}`
  const host = projectId ? `https://${projectId}.api.sanity.io` : apiHost
  const queryParams = includeQueryTag ? {tag: 'sanity.cli', ...query} : query

  return nock(host)[method](`/${version}${uri}`).query(queryParams)
}

/**
 * Registers an `afterEach` hook that fails the test when nock interceptors
 * were set up but never hit, and cleans them all up so state never leaks
 * between tests. Call once from a vitest setup file or at the top of a test
 * file.
 *
 * @internal
 */
export function setupNockHygiene(): void {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })
}
