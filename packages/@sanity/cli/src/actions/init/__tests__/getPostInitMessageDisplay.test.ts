import {describe, expect, test} from 'vitest'

import {getPostInitMessageDisplay} from '../getPostInitMessageDisplay.js'

describe('getPostInitMessageDisplay', () => {
  test('returns null for undefined', () => {
    expect(getPostInitMessageDisplay(undefined)).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(getPostInitMessageDisplay('')).toBeNull()
    expect(getPostInitMessageDisplay('   ')).toBeNull()
  })

  test('returns single line for non-empty string', () => {
    expect(getPostInitMessageDisplay('Hello')).toEqual(['Hello'])
  })

  test('splits string on newlines like separate array entries', () => {
    expect(getPostInitMessageDisplay('a\n\nb')).toEqual(['a', 'b'])
  })

  test('strips ANSI sequences from string', () => {
    const withAnsi = '\u001B[31mred\u001B[0m text'
    expect(getPostInitMessageDisplay(withAnsi)).toEqual(['red text'])
  })

  test('returns null for empty array', () => {
    expect(getPostInitMessageDisplay([])).toBeNull()
  })

  test('returns null when array is only whitespace', () => {
    expect(getPostInitMessageDisplay(['', '  ', '\t'])).toBeNull()
  })

  test('filters empty entries and preserves order', () => {
    expect(getPostInitMessageDisplay(['a', '', '  ', 'b'])).toEqual(['a', 'b'])
  })

  test('strips ANSI from each array line', () => {
    expect(getPostInitMessageDisplay(['\u001B[1mbold\u001B[0m', 'plain'])).toEqual([
      'bold',
      'plain',
    ])
  })
})
