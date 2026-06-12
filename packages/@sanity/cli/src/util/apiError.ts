/**
 * Type guard for API errors that carry an HTTP status code.
 */
export function hasStatusCode(err: unknown): err is {statusCode: number} {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof err.statusCode === 'number'
  )
}
