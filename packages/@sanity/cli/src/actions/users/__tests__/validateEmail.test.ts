import {describe, expect, test} from 'vitest'

import {validateEmail} from '../validateEmail.js'

describe('validateEmail', () => {
  test('returns true for valid email', () => {
    expect(validateEmail('test@test.com')).toBe(true)
  })

  test('returns "Email is required" for empty email', () => {
    expect(validateEmail('')).toBe('Email is required')
    expect(validateEmail(' ')).toBe('Email is required')
  })

  test('returns "Please enter a valid email address" for invalid email', () => {
    expect(validateEmail('invalid-email')).toBe('Please enter a valid email address')
  })
})
