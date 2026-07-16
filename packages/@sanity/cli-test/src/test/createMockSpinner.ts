import {type SpinnerInstance} from '@sanity/cli-core/ux'
import {Mock, vi} from 'vitest'

/**
 * Creates a mock spinner function to avoid writing output to stdout.
 * @param overrides - Pass any mocks or stubs for test expectations
 * @internal
 * @deprecated Use mocks/cli-core/ux/spinner instead
 */
export function createMockSpinner(
  overrides?: Partial<SpinnerInstance>,
): Mock<(options: string) => SpinnerInstance> {
  return vi.fn((options: string) => {
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
      isEnabled: false,
      isSilent: false,
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
      stopAndPersist: function (_options?: any): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      succeed: function (_text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      suffixText: '',
      text: options,
      warn: function (_text?: string): SpinnerInstance {
        throw new Error('Function not implemented.')
      },
      ...overrides,
    }
  })
}
