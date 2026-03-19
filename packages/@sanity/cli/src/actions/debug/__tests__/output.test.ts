import {describe, expect, test} from 'vitest'

import {formatKeyValue, sectionHeader} from '../output.js'

describe('sectionHeader', () => {
  test('returns text with colon appended', () => {
    const result = sectionHeader('User')
    expect(result).toContain('User:')
  })

  test('does not double-append colon if already present', () => {
    const result = sectionHeader('User')
    expect(result).not.toContain('User::')
  })
})

describe('formatKeyValue', () => {
  test('formats key and string value', () => {
    const result = formatKeyValue('Name', 'Test User')
    expect(result).toContain('Name:')
    expect(result).toContain('Test User')
  })

  test('indents with 2 spaces by default', () => {
    const result = formatKeyValue('Name', 'Test User')
    expect(result).toMatch(/^ {2}\S/)
  })

  test('supports custom indent', () => {
    const result = formatKeyValue('Name', 'Test User', {indent: 6})
    expect(result).toMatch(/^ {6}\S/)
  })

  test('aligns values when padTo is provided', () => {
    const short = formatKeyValue('ID', 'abc', {padTo: 10})
    const long = formatKeyValue('Project ID', 'abc', {padTo: 10})
    // Both values should start at the same column
    expect(short.indexOf('abc')).toBe(long.indexOf('abc'))
  })

  test('handles array values', () => {
    const result = formatKeyValue('Roles', ['admin', 'editor'])
    expect(result).toContain('admin')
    expect(result).toContain('editor')
  })

  test('handles number values', () => {
    const result = formatKeyValue('Count', 42)
    expect(result).toContain('42')
  })

  test('handles boolean values', () => {
    const result = formatKeyValue('Active', true)
    expect(result).toContain('true')
  })

  test('handles null values', () => {
    const result = formatKeyValue('Value', null)
    expect(result).toContain('null')
  })

  test('handles object values using inspect', () => {
    const result = formatKeyValue('Config', {key: 'val'})
    expect(result).toContain('key')
    expect(result).toContain('val')
  })
})
