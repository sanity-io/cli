import {type Mock, vi} from 'vitest'

async function passthroughMiddleware(opts: unknown, next: (opts: unknown) => unknown) {
  return next(opts)
}

/** @internal */
export const mockRequest: Mock = vi.fn()
/** @internal */
export const createRequester: Mock = vi.fn(() => mockRequest)
/** @internal */
export const HttpError = class HttpError extends Error {
  response: unknown
  status: number
  statusText: string
  constructor(message = 'HTTP Error') {
    super(message)
    this.status = 500
    this.statusText = 'Internal Server Error'
    this.response = undefined
  }
}
/** @internal */
export const debug: Mock = vi.fn(() => passthroughMiddleware)
/** @internal */
export const retry: Mock = vi.fn(() => passthroughMiddleware)
/** @internal */
export const nodeReadableFromWeb: Mock = vi.fn((stream: unknown) => stream)
