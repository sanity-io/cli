import {describe, expect, test} from 'vitest'

import {describeServiceUnavailable, getDeployErrorMessage} from '../serviceUnavailable.js'

const httpError = (statusCode: number) =>
  Object.assign(new Error(`HTTP ${statusCode}`), {response: {body: '<html></html>'}, statusCode})

const fetchFailed = (cause?: unknown) => new TypeError('fetch failed', {cause})

describe('describeServiceUnavailable', () => {
  test.each([502, 503, 504])('describes HTTP %i as the service being unavailable', (code) => {
    const message = describeServiceUnavailable(httpError(code))

    expect(message).toContain(`Sanity’s deployment service is unavailable (HTTP ${code})`)
    expect(message).toContain('try again in a few minutes')
    expect(message).toContain('https://www.sanity-status.com')
  })

  test.each([400, 403, 404, 409, 500])('leaves HTTP %i to its own message', (code) => {
    expect(describeServiceUnavailable(httpError(code))).toBeUndefined()
  })

  test('names the socket error behind a failed fetch', () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND api.sanity.io'), {
      code: 'ENOTFOUND',
    })

    const message = describeServiceUnavailable(fetchFailed(cause))

    expect(message).toContain('Couldn’t reach the Sanity API (ENOTFOUND)')
    expect(message).toContain('Check your internet connection and proxy settings')
    expect(message).toContain('https://www.sanity-status.com')
  })

  test('falls back to a generic reason when a failed fetch has no error code', () => {
    expect(describeServiceUnavailable(fetchFailed(new Error('bad port')))).toContain(
      'Couldn’t reach the Sanity API (network error)',
    )
    expect(describeServiceUnavailable(fetchFailed())).toContain(
      'Couldn’t reach the Sanity API (network error)',
    )
  })

  test('describes a timed-out request', () => {
    const error = new DOMException('The operation was aborted due to timeout', 'TimeoutError')

    expect(describeServiceUnavailable(error)).toContain(
      'Couldn’t reach the Sanity API (request timed out)',
    )
  })

  test('describes a socket error raised directly', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
      code: 'ECONNREFUSED',
    })

    expect(describeServiceUnavailable(error)).toContain(
      'Couldn’t reach the Sanity API (ECONNREFUSED)',
    )
  })

  test('describes a socket error that is not an Error instance', () => {
    expect(describeServiceUnavailable({code: 'ECONNRESET', message: 'socket hang up'})).toContain(
      'Couldn’t reach the Sanity API (ECONNRESET)',
    )
  })

  test.each([
    ['an unrelated error code', Object.assign(new Error('nope'), {code: 'ENOENT'})],
    ['an unrelated TypeError', new TypeError('x is not a function')],
    ['a plain error', new Error('Something else')],
    ['a non-error value', 'boom'],
    ['undefined', undefined],
  ])('ignores %s', (_label, error) => {
    expect(describeServiceUnavailable(error)).toBeUndefined()
  })
})

describe('getDeployErrorMessage', () => {
  test('prefers the unavailable message', () => {
    expect(getDeployErrorMessage(httpError(503))).toContain(
      'Sanity’s deployment service is unavailable (HTTP 503)',
    )
  })

  test('falls back to the error’s own message', () => {
    expect(getDeployErrorMessage(new Error('Slug is taken'))).toBe('Slug is taken')
  })
})
