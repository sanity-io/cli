import type {SpinnerInstance} from '@sanity/cli-core/ux'
import type {PersistOptions} from 'ora'
import {Mock, vi} from 'vitest'

/**
 * Creates a mock spinner function to avoid writing output to stdout.
 * @param overrides Pass any mocks or stubs for test expectations
 * @internal
 */
export function createMockSpinner(
  overrides?: Partial<SpinnerInstance>,
): Mock<(options: string) => SpinnerInstance> {
  return vi.fn(() => {
    return {
      text: '',
      prefixText: '',
      suffixText: '',
      color: false,
      indent: 0,
      spinner: {
        interval: undefined,
        frames: [],
      },
      isSpinning: false,
      interval: 0,
      start: function (text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      stop: function (): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      succeed: function (text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      fail: function (text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      warn: function (text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      info: function (text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      stopAndPersist: function (options?: PersistOptions): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      clear: function (): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      render: function (): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      frame: function (): string {
        throw new Error('Function not implemented.')
      },
      ...overrides,
    }
  })
}
