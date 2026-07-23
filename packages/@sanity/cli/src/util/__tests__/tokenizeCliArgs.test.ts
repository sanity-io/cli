import {describe, expect, test} from 'vitest'

import {tokenizeCliArgs} from '../tokenizeCliArgs.js'

describe('tokenizeCliArgs', () => {
  test('splits on whitespace', () => {
    expect(tokenizeCliArgs('cors list --project-id abc123')).toEqual([
      'cors',
      'list',
      '--project-id',
      'abc123',
    ])
  })

  test('collapses repeated whitespace, tabs and newlines', () => {
    expect(tokenizeCliArgs('  cors\t list \n --json  ')).toEqual(['cors', 'list', '--json'])
  })

  test('preserves spaces inside double quotes', () => {
    expect(tokenizeCliArgs('cors add "https://example.com/some path"')).toEqual([
      'cors',
      'add',
      'https://example.com/some path',
    ])
  })

  test('preserves spaces inside single quotes', () => {
    expect(tokenizeCliArgs("cors add 'https://example.com/some path'")).toEqual([
      'cors',
      'add',
      'https://example.com/some path',
    ])
  })

  test('supports quotes adjacent to unquoted text', () => {
    expect(tokenizeCliArgs('--name="my project"')).toEqual(['--name=my project'])
  })

  test('supports escaped double quotes inside double quotes', () => {
    expect(tokenizeCliArgs('echo "say \\"hi\\""')).toEqual(['echo', 'say "hi"'])
  })

  test('supports escaped backslash inside double quotes', () => {
    expect(tokenizeCliArgs('"a\\\\b"')).toEqual(['a\\b'])
  })

  test('does not treat backslash as escape inside single quotes', () => {
    expect(tokenizeCliArgs("'a\\b'")).toEqual(['a\\b'])
  })

  test('supports backslash escapes outside quotes', () => {
    expect(tokenizeCliArgs('a\\ b')).toEqual(['a b'])
  })

  test('produces an empty token for empty quotes', () => {
    expect(tokenizeCliArgs("--flag ''")).toEqual(['--flag', ''])
  })

  test('returns an empty array for empty or blank input', () => {
    expect(tokenizeCliArgs('')).toEqual([])
    expect(tokenizeCliArgs('   ')).toEqual([])
  })

  test('throws on unterminated double quote', () => {
    expect(() => tokenizeCliArgs('cors add "https://example.com')).toThrow(
      'Unterminated double quote',
    )
  })

  test('throws on unterminated single quote', () => {
    expect(() => tokenizeCliArgs("cors add 'https://example.com")).toThrow(
      'Unterminated single quote',
    )
  })
})
