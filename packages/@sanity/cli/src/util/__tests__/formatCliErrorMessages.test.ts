import {describe, expect, test} from 'vitest'

import {formatCliErrorMessages} from '../formatCliErrorMessages.js'

describe('formatCliErrorMessages', () => {
  test('formats each message as a separate CLI error', () => {
    expect(formatCliErrorMessages(['First message', 'Second message', 'Third message'])).toBe(
      'First message\nError: Second message\nError: Third message',
    )
  })

  test('preserves a single message', () => {
    expect(formatCliErrorMessages(['Only message'])).toBe('Only message')
  })
})
