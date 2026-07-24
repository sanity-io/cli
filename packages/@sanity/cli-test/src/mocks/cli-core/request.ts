import {type Mock, vi} from 'vitest'

async function passthroughMiddleware(opts: unknown, next: (opts: unknown) => unknown) {
  return next(opts)
}

/** @internal */
export const mockRequest: Mock = vi.fn()
/** @internal */
export const createRequester: Mock = vi.fn(() => mockRequest)
// Re-export the real error classes (from get-it directly, since the
// `@sanity/cli-core/request` module id is the one being mocked) so
// `instanceof` checks behave the same under the mock.
/** @internal */
export {HttpError, TimeoutError} from 'get-it'
/** @internal */
export const debug: Mock = vi.fn(() => passthroughMiddleware)
/** @internal */
export const retry: Mock = vi.fn(() => passthroughMiddleware)
/** @internal */
export const nodeReadableFromWeb: Mock = vi.fn((stream: unknown) => stream)
