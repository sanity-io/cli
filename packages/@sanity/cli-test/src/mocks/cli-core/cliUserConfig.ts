import {type Mock, vi} from 'vitest'
/** @internal */
export const getCliToken: Mock = vi.fn()
/** @internal */
export const setCliUserConfig: Mock = vi.fn()
/** @internal */
export const getCliUserConfig: Mock = vi.fn()
/** @internal */
export const getUserConfig: Mock = vi.fn(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}))
