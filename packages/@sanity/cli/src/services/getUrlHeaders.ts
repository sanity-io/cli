import {createRequester} from '@sanity/cli-core/request'

const request = createRequester()

/**
 * Gets the headers of a URL
 *
 * @param url - The URL to get the headers from
 * @param headers - The headers to send with the request
 * @returns The headers of the response
 */
export async function getUrlHeaders(url: string, headers = {}): Promise<Record<string, string>> {
  const response = await request({
    headers,
    method: 'HEAD',
    redirect: 'manual',
    url,
  })

  return Object.fromEntries(response.headers.entries())
}
