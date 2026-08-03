/**
 * Build an error object that satisfies `isHttpError()` from `@sanity/client`,
 * for use in tests that exercise HTTP status code handling.
 */
export function httpError(statusCode: number, message = `HTTP ${statusCode}`): Error {
  const err = new Error(message)
  Object.assign(err, {
    response: {
      body: {},
      headers: {},
      method: 'GET',
      statusCode,
      statusMessage: null,
      url: 'https://api.sanity.io/v2025-12-09/organizations',
    },
    statusCode,
  })
  return err
}
