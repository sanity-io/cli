import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'
import {vi} from 'vitest'

/**
 * Options for createTestClient
 *
 * @public
 */
export interface CreateTestClientOptions extends ClientConfig {
  /**
   * API version for the client
   */
  apiVersion: string

  /**
   * Authentication token
   */
  token: string
}

/**
 * Creates a real Sanity client instance for testing that makes actual HTTP requests.
 * Use with mockApi() to intercept and mock the HTTP calls.
 *
 * @public
 *
 * @example
 * ```typescript
 * // Mock getGlobalCliClient to return a test client
 * vi.mock('@sanity/cli-core', async (importOriginal) => {
 *   const actual = await importOriginal<typeof import('@sanity/cli-core')>()
 *   const {createTestClient} = await import('@sanity/cli-test')
 *
 *   return {
 *     ...actual,
 *     getGlobalCliClient: vi.fn().mockImplementation((opts) => {
 *       return Promise.resolve(createTestClient({
 *         apiVersion: opts.apiVersion,
 *       }))
 *     }),
 *   }
 * })
 *
 * // Then use mockApi to intercept requests
 * mockApi({
 *   apiVersion: 'v2025-02-19',
 *   method: 'get',
 *   uri: '/media-libraries',
 * }).reply(200, {data: [...]})
 * ```
 */
export function createTestClient(options: CreateTestClientOptions): {
  client: SanityClient
  request: ReturnType<typeof vi.fn>
} {
  const {apiVersion, projectId, token, ...rest} = options

  const client = createClient({
    apiVersion,
    projectId,
    requestTagPrefix: 'sanity.cli',
    token,
    useCdn: false,
    useProjectHostname: projectId ? true : false,
    ...rest,
  })

  /**
   * Mock the request method of the client to return the actual response from the client
   */
  const request = vi.fn((...args: Parameters<typeof client.request>) => client.request(...args))

  return {
    client,
    request,
  }
}
