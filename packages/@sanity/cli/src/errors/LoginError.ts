/**
 * Thrown when interactive login fails or is cancelled.
 * Callers can use this to distinguish login failures (suggest `sanity login`)
 * from transient network/server errors (don't suggest login).
 *
 * @internal
 */
export class LoginError extends Error {
  override name = 'LoginError'
}
