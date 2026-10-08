import {describe, expect, test} from 'vitest'

import {prettyPrintError} from '../prettyPrintError.js'

describe('prettyPrintError', () => {
  test('returns an empty string for non-error values', () => {
    expect(prettyPrintError('boom')).toBe('')
    expect(prettyPrintError(undefined)).toBe('')
    expect(prettyPrintError(null)).toBe('')
    expect(prettyPrintError({message: 'no name'})).toBe('')
  })

  test('renders the error name and message', () => {
    expect(prettyPrintError(new Error('Failed to upload schema'))).toBe(
      'Error: Failed to upload schema',
    )
  })

  test('uses the error name as the header prefix', () => {
    const error = new TypeError('fetch failed')

    expect(prettyPrintError(error)).toBe('TypeError: fetch failed')
  })

  test('falls back to "Error" when the name is empty', () => {
    const error = new Error('nameless')
    error.name = ''

    expect(prettyPrintError(error)).toBe('Error: nameless')
  })

  test('omits the header when the message is empty', () => {
    const error = new Error('placeholder')
    error.message = ''
    Object.assign(error, {code: 'ENOENT'})

    expect(prettyPrintError(error)).toBe('Code: ENOENT')
  })

  test('renders code, a single suggestion and reference', () => {
    const error = new Error('Unauthorized')
    Object.assign(error, {
      code: 'EAUTH',
      ref: 'https://www.sanity.io/docs',
      suggestions: ['Run `sanity login`'],
    })

    expect(prettyPrintError(error)).toBe(
      [
        'Error: Unauthorized',
        'Code: EAUTH',
        'Try this: Run `sanity login`',
        'Reference: https://www.sanity.io/docs',
      ].join('\n'),
    )
  })

  test('renders multiple suggestions as a bulleted list', () => {
    const error = new Error('Unknown command')
    Object.assign(error, {suggestions: ['sanity dataset list', 'sanity dataset create']})

    expect(prettyPrintError(error)).toBe(
      [
        'Error: Unknown command',
        'Try this:',
        '  * sanity dataset list',
        '  * sanity dataset create',
      ].join('\n'),
    )
  })

  test('ignores an empty suggestions array', () => {
    const error = new Error('No suggestions')
    Object.assign(error, {suggestions: []})

    expect(prettyPrintError(error)).toBe('Error: No suggestions')
  })

  test('renders the full cause chain as "Caused by" lines', () => {
    const timeoutError = new Error('Connect Timeout Error')
    timeoutError.name = 'ConnectTimeoutError'
    Object.assign(timeoutError, {code: 'UND_ERR_CONNECT_TIMEOUT'})
    const fetchError = new TypeError('fetch failed', {cause: timeoutError})
    const wrapper = new Error('Failed to upload schema', {cause: fetchError})

    expect(prettyPrintError(wrapper)).toBe(
      [
        'Error: Failed to upload schema',
        'Caused by: TypeError: fetch failed',
        'Caused by: ConnectTimeoutError: Connect Timeout Error',
        'Code: UND_ERR_CONNECT_TIMEOUT',
      ].join('\n'),
    )
  })

  test('stops walking at a non-error cause', () => {
    expect(prettyPrintError(new Error('boom', {cause: 'socket hang up'}))).toBe('Error: boom')
  })
})
