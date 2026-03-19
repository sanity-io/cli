import {describe, expect, test} from 'vitest'

import {InitError} from '../initError.js'

describe('InitError', () => {
  test('creates error with message and exit code', () => {
    const error = new InitError('Something went wrong', 1)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(InitError)
    expect(error.message).toBe('Something went wrong')
    expect(error.exitCode).toBe(1)
    expect(error.name).toBe('InitError')
  })

  test('defaults exit code to 1', () => {
    const error = new InitError('fail')
    expect(error.exitCode).toBe(1)
  })
})
