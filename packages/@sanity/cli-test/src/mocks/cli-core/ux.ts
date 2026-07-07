import {type Mock, vi} from 'vitest'
/** @internal */
export const boxen: Mock = vi.fn((str: string) => str)
/** @internal */
export const colorizeJson: Mock = vi.fn()
/** @internal */
export const logSymbols = {error: 'e', info: 'i', success: 's', warning: 'w'}
/** @internal */
export const checkbox: Mock = vi.fn()
/** @internal */
export const confirm: Mock = vi.fn()
/** @internal */
export const editor: Mock = vi.fn()
/** @internal */
export const expand: Mock = vi.fn()
/** @internal */
export const input: Mock = vi.fn()
/** @internal */
export const number: Mock = vi.fn()
/** @internal */
export const password: Mock = vi.fn()
/** @internal */
export const rawlist: Mock = vi.fn()
/** @internal */
export const search: Mock = vi.fn()
/** @internal */
export const select: Mock = vi.fn()
/**
 * Spy for asserting on what text is assigned to a terminal spinner.
 * @internal
 */
export const spinnerText: Mock = vi.fn()
/** @internal */
export const spinner: Mock = vi.fn(() => {
  const mockSpin = {
    fail: vi.fn(),
    render: vi.fn(),
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn(),
  }
  Object.defineProperty(mockSpin, 'text', {
    configurable: true,
    set: spinnerText,
  })
  return mockSpin
})
/** @internal */
export const spinnerPromise: Mock = vi.fn()
/** @internal */
export const getTimer: Mock = vi
  .fn()
  .mockReturnValue({end: vi.fn().mockReturnValue(0), start: vi.fn()})
