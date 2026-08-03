import {type Mock, vi} from 'vitest'
/** @internal */
export const mockRequest: Mock = vi.fn()
/** @internal */
export const createRequester: Mock = vi.fn(() => mockRequest)
// get-it/middleware mocks
/** @internal */
export const agent: Mock = vi.fn(() => ({finalizeOptions: vi.fn()}))
/** @internal */
export const base: Mock = vi.fn(() => ({processOptions: vi.fn()}))
/** @internal */
export const injectResponse: Mock = vi.fn(() => ({interceptRequest: vi.fn()}))
/** @internal */
export const jsonRequest: Mock = vi.fn(() => ({processOptions: vi.fn()}))
/** @internal */
export const jsonResponse: Mock = vi.fn(() => ({onResponse: vi.fn(), processOptions: vi.fn()}))
/** @internal */
export const keepAlive: Mock = vi.fn()
/** @internal */
export const observable: Mock = vi.fn(() => ({onReturn: vi.fn()}))
/** @internal */
export const progress: Mock = vi.fn(() => ({
  onHeaders: vi.fn(),
  onRequest: vi.fn(),
  onResponse: vi.fn(),
}))
/** @internal */
export const proxy: Mock = vi.fn(() => ({processOptions: vi.fn()}))
/** @internal */
export const retry: Mock = vi.fn(() => ({onError: vi.fn()}))
/** @internal */
export const urlEncoded: Mock = vi.fn(() => ({processOptions: vi.fn()}))
