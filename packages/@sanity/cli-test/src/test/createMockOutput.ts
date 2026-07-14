import {type Output} from '@sanity/cli-core/types'
import {vi} from 'vitest'

/**
 * Creates an `Output` implementation backed by vitest mock functions.
 *
 * @internal
 */
export function createMockOutput(): Output {
  return {
    error: vi.fn(() => undefined as never),
    log: vi.fn(),
    warn: vi.fn(),
  }
}
