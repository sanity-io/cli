import {writeFileSync} from 'node:fs'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {writeJsonFileSync} from '../writeJsonFileSync'

vi.mock('node:fs')

describe('writeJsonFileSync', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('writes compact JSON with trailing newline by default', () => {
    writeJsonFileSync('/path/to/file.json', {key: 'value'})
    expect(writeFileSync).toHaveBeenCalledWith('/path/to/file.json', '{"key":"value"}\n', 'utf8')
  })

  test('writes pretty JSON with trailing newline when option is set', () => {
    writeJsonFileSync('/path/to/file.json', {key: 'value'}, {pretty: true})
    expect(writeFileSync).toHaveBeenCalledWith(
      '/path/to/file.json',
      `${JSON.stringify({key: 'value'}, null, 2)}\n`,
      'utf8',
    )
  })

  test('wraps write errors with descriptive message and cause', () => {
    const fsError = new Error('EACCES: permission denied')
    vi.mocked(writeFileSync).mockImplementationOnce(() => {
      throw fsError
    })

    try {
      writeJsonFileSync('/readonly/file.json', {key: 'value'})
      expect.fail('Expected writeJsonFileSync to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toBe('Failed to write "/readonly/file.json"')
      expect((err as Error).cause).toBe(fsError)
    }
  })

  test('wraps serialization errors with descriptive message', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(() => writeJsonFileSync('/path/to/file.json', circular)).toThrow(
      'Failed to write "/path/to/file.json"',
    )
  })
})
