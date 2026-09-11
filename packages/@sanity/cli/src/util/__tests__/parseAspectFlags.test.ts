import {describe, expect, test} from 'vitest'

import {parseAspectFlags} from '../parseAspectFlags.js'

describe('#parseAspectFlags', () => {
  test('assembles key=value pairs', () => {
    expect(parseAspectFlags(['department=Brand', 'campaign=Spring'])).toEqual({
      aspects: {campaign: 'Spring', department: 'Brand'},
    })
  })

  test('returns no aspects for an empty flag list', () => {
    expect(parseAspectFlags([])).toEqual({aspects: {}})
  })

  test('keeps only the last value for a repeated key', () => {
    expect(parseAspectFlags(['department=Brand', 'department=Legal'])).toEqual({
      aspects: {department: 'Legal'},
    })
  })

  test('trims whitespace around the key but preserves it in the value', () => {
    expect(parseAspectFlags([' department = Brand '])).toEqual({
      aspects: {department: ' Brand '},
    })
  })

  test('keeps separators after the first as part of the value', () => {
    expect(parseAspectFlags(['note=a=b'])).toEqual({aspects: {note: 'a=b'}})
  })

  test('accepts an explicitly empty value', () => {
    expect(parseAspectFlags(['department='])).toEqual({aspects: {department: ''}})
  })

  test('leaves values as strings rather than coercing them', () => {
    expect(parseAspectFlags(['count=42', 'archived=true'])).toEqual({
      aspects: {archived: 'true', count: '42'},
    })
  })

  test('does not expose Object.prototype through an aspect name', () => {
    const result = parseAspectFlags(['constructor=Brand'])
    expect(result).toEqual({aspects: {constructor: 'Brand'}})
    expect('error' in result).toBe(false)
  })

  test.each([
    ['a value with no separator', 'department'],
    ['a leading separator', '=Brand'],
  ])('reports %s', (_label, flag) => {
    expect(parseAspectFlags([flag])).toEqual({
      error: `Invalid --aspect "${flag}": expected key=value format`,
    })
  })

  test('reports the first malformed occurrence', () => {
    expect(parseAspectFlags(['department=Brand', 'oops', 'other=bad'])).toEqual({
      error: 'Invalid --aspect "oops": expected key=value format',
    })
  })
})
