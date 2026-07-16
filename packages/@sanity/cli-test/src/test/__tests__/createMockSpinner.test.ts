import {describe, expect, it} from 'vitest'

import {createMockSpinner} from '../createMockSpinner.js'

describe('createMockSpinner', () => {
  it('sets text from options', () => {
    const mockSpinner = createMockSpinner()
    const spinner = mockSpinner('Loading')

    expect(spinner.text).toBe('Loading')
  })
})
