import {describe, expect, test} from 'vitest'

import {
  flattenErrorCauses,
  formatErrorCauses,
  rebuildErrorCauseChain,
  type SerializedErrorCause,
} from '../errorCauseChain.js'

describe('flattenErrorCauses', () => {
  test('returns empty array for an error without a cause', () => {
    expect(flattenErrorCauses(new Error('boom'))).toEqual([])
  })

  test('returns empty array for a non-error value', () => {
    expect(flattenErrorCauses('boom')).toEqual([])
    expect(flattenErrorCauses(undefined)).toEqual([])
  })

  test('flattens a nested cause chain with transport codes, outermost first', () => {
    const timeoutError = new Error('Connect Timeout Error')
    timeoutError.name = 'ConnectTimeoutError'
    Object.assign(timeoutError, {code: 'UND_ERR_CONNECT_TIMEOUT'})
    const fetchError = new TypeError('fetch failed', {cause: timeoutError})
    const wrapper = new Error('Failed to upload schema', {cause: fetchError})

    expect(flattenErrorCauses(wrapper)).toEqual([
      {message: 'fetch failed', name: 'TypeError'},
      {
        code: 'UND_ERR_CONNECT_TIMEOUT',
        message: 'Connect Timeout Error',
        name: 'ConnectTimeoutError',
      },
    ])
  })

  test('ignores non-string code properties', () => {
    const cause = new Error('errno only')
    Object.assign(cause, {code: -110})

    expect(flattenErrorCauses(new Error('boom', {cause}))).toEqual([
      {message: 'errno only', name: 'Error'},
    ])
  })

  test('stringifies a non-error cause and stops there', () => {
    expect(flattenErrorCauses(new Error('boom', {cause: 'socket hang up'}))).toEqual([
      {message: 'socket hang up', name: 'Error'},
    ])
  })

  test('caps self-referential cause chains', () => {
    const error = new Error('ouroboros')
    error.cause = error

    expect(flattenErrorCauses(error)).toHaveLength(10)
  })
})

describe('formatErrorCauses', () => {
  test('returns empty string for no causes', () => {
    expect(formatErrorCauses([])).toBe('')
  })

  test('formats name, code and message for each cause', () => {
    const causes: SerializedErrorCause[] = [
      {message: 'fetch failed', name: 'TypeError'},
      {code: 'ETIMEDOUT', message: 'connect ETIMEDOUT 1.2.3.4:443', name: 'Error'},
    ]

    expect(formatErrorCauses(causes)).toBe(
      'TypeError: fetch failed <- Error [ETIMEDOUT]: connect ETIMEDOUT 1.2.3.4:443',
    )
  })
})

describe('rebuildErrorCauseChain', () => {
  test('returns undefined for no causes', () => {
    expect(rebuildErrorCauseChain([])).toBeUndefined()
  })

  test('rebuilds a walkable error chain with names and codes', () => {
    const rebuilt = rebuildErrorCauseChain([
      {message: 'fetch failed', name: 'TypeError'},
      {code: 'EAI_AGAIN', message: 'getaddrinfo EAI_AGAIN api.sanity.io', name: 'Error'},
    ])

    expect(rebuilt).toBeInstanceOf(Error)
    expect(rebuilt?.name).toBe('TypeError')
    expect(rebuilt?.message).toBe('fetch failed')
    const inner = rebuilt?.cause as Error & {code?: string}
    expect(inner).toBeInstanceOf(Error)
    expect(inner.message).toBe('getaddrinfo EAI_AGAIN api.sanity.io')
    expect(inner.code).toBe('EAI_AGAIN')
    expect(inner.cause).toBeUndefined()
  })

  test('round-trips a flattened chain', () => {
    const original = new Error('outer', {cause: new Error('inner')})
    const rebuilt = rebuildErrorCauseChain(flattenErrorCauses(original))

    expect(flattenErrorCauses(new Error('outer', {cause: rebuilt}))).toEqual(
      flattenErrorCauses(original),
    )
  })
})
