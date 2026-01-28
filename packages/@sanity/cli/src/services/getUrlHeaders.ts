import {getIt} from 'get-it'
import {promise} from 'get-it/middleware'

const request = getIt([promise()])

export class HttpError extends Error {
  statusCode?: number

  constructor(message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

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

  if (response.statusCode >= 400) {
    const error = new HttpError(`Request returned HTTP ${response.statusCode}`)
    error.statusCode = response.statusCode
    throw error
  }

  response.body.resume()
  return response.headers
}
