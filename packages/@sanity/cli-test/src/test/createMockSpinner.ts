import {type SpinnerInstance} from '@sanity/cli-core/ux'
import {type PersistOptions} from 'ora'
import {Mock, vi} from 'vitest'

/**
 * Creates a mock spinner function to avoid writing output to stdout.
 * @param overrides - Pass any mocks or stubs for test expectations
 * @internal
 */
export function createMockSpinner(
  overrides?: Partial<SpinnerInstance>,
): Mock<(options: string) => SpinnerInstance> {
  return vi.fn(() => {
    return {
      clear: function (): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      color: false,
      fail: function (_text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      frame: function (): string {
        throw new Error('Function not implemented.')
      },
      indent: 0,
      info: function (_text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      interval: 0,
      isSpinning: false,
      prefixText: '',
      render: function (): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      spinner: {
        frames: [],
        interval: undefined,
      },
      start: function (_text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      stop: function (): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      stopAndPersist: function (_options?: PersistOptions): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      succeed: function (_text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      suffixText: '',
      text: '',
      warn: function (_text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      ...overrides,
    }
  })
}
