import {createRequester} from '@sanity/cli-core/request'

const request = createRequester({middleware: {promise: {onlyBody: false}}})

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
    maxRedirects: 0,
    method: 'HEAD',
    stream: true,
    url,
  })

  response.body.resume()
  return response.headers
}
