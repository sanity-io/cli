import {readFileSync} from 'node:fs'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {readJsonFileSync} from '../readJsonFileSync'

vi.mock('node:fs')

describe('readJsonFileSync', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('reads and parses valid JSON', () => {
    vi.mocked(readFileSync).mockReturnValueOnce('{"key":"value"}')
    expect(readJsonFileSync('/path/to/file.json')).toEqual({key: 'value'})
    expect(readFileSync).toHaveBeenCalledWith('/path/to/file.json', 'utf8')
  })

  test('wraps read errors with descriptive message and cause', () => {
    const fsError = new Error('ENOENT: no such file or directory')
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw fsError
    })

    expect(() => readJsonFileSync('/missing/file.json')).toThrow(
      'Failed to read "/missing/file.json"',
    )

    try {
      readJsonFileSync('/missing/file.json')
    } catch (err) {
      // First call already threw, re-mock for second call
    }

    // Verify cause is preserved
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw fsError
    })
    try {
      readJsonFileSync('/missing/file.json')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).cause).toBe(fsError)
    }
  })

  test('wraps JSON parse errors with descriptive message and cause', () => {
    vi.mocked(readFileSync).mockReturnValueOnce('not valid json{{{')

    expect(() => readJsonFileSync('/path/to/corrupt.json')).toThrow(
      'Failed to parse "/path/to/corrupt.json" as JSON',
    )

    // Verify cause is a SyntaxError from JSON.parse
    vi.mocked(readFileSync).mockReturnValueOnce('not valid json{{{')
    try {
      readJsonFileSync('/path/to/corrupt.json')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).cause).toBeInstanceOf(SyntaxError)
    }
  })
})
