/**
 * Incomplete error type for [get-it](https://github.com/sanity-io/get-it)
 * `httpError` middleware. Should preferably be tidied up and exported
 * from that module. Feel free to do so if you've got time! 🙏
 *
 * @internal
 */
interface HttpError {
  request: {
    headers: unknown
  }
  response: {
    body: unknown
    method: string
    statusCode: number
    statusMessage: string
    url: string
  }
}

/**
 * Checks if the given `err` is an instance of `HttpError` from `get-it`
 * (request library used by `@sanity/client`).
 *
 * @param err - The error to check
 * @returns `true` if the error is an instance of `HttpError`, otherwise `false`
 * @internal
 */
export function isHttpError(err: unknown): err is HttpError {
  return (
    err instanceof Error &&
    'request' in err &&
    'response' in err &&
    typeof err.response === 'object' &&
    err.response !== null &&
    'statusCode' in err.response &&
    typeof err.response.statusCode === 'number'
  )
}
