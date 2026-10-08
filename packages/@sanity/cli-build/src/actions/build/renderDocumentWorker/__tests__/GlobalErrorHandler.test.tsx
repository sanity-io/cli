// @vitest-environment jsdom
import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {GlobalErrorHandler} from '../components/GlobalErrorHandler.js'

describe('GlobalErrorHandler', () => {
  beforeAll(() => {
    const script = GlobalErrorHandler().props.dangerouslySetInnerHTML.__html
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    globalThis.eval(script)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  test('shows the overlay for an uncaught error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    globalThis.dispatchEvent(new ErrorEvent('error', {error: new Error('Boom'), message: 'Boom'}))
    vi.runAllTimers()

    expect(document.querySelector('#__sanityError')?.textContent).toContain('Uncaught error: Boom')
  })

  test('ignores browser error events that carry no error object', () => {
    // Chromium fires these for a ResizeObserver loop, and for cross-origin "Script error."
    globalThis.dispatchEvent(
      new ErrorEvent('error', {
        error: null,
        message: 'ResizeObserver loop completed with undelivered notifications.',
      }),
    )

    expect(() => vi.runAllTimers()).not.toThrow()
    expect(document.querySelector('#__sanityError')).toBeNull()
  })

  test('renders the message, source location and stack of a regular Error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    globalThis.dispatchEvent(
      new ErrorEvent('error', {
        colno: 7,
        error: new Error('Something broke'),
        filename: 'https://example.com/static/app.js',
        lineno: 42,
        message: 'Uncaught Error: Something broke',
      }),
    )
    vi.runAllTimers()

    const overlay = document.querySelector('#__sanityError')
    expect(overlay?.textContent).toContain('Uncaught error: Something broke')
    expect(overlay?.textContent).toContain('https://example.com/static/app.js:42:7')
    expect(overlay?.querySelector('pre')?.textContent).toContain('Error: Something broke')
  })

  test('renders the browser message when a string is thrown', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // A thrown string reaches the handler as the error, but has no message or stack of its own.
    globalThis.dispatchEvent(new ErrorEvent('error', {error: 'boom', message: 'Uncaught boom'}))
    vi.runAllTimers()

    const overlay = document.querySelector('#__sanityError')
    expect(overlay?.textContent).toContain('Uncaught error: Uncaught boom')
    expect(overlay?.textContent).not.toContain('undefined')
    expect(overlay?.querySelector('pre')?.textContent).toBe('')
  })

  test('renders the browser message when a non-Error object is thrown', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    globalThis.dispatchEvent(
      new ErrorEvent('error', {error: {code: 'E_BOOM'}, message: 'Uncaught [object Object]'}),
    )
    vi.runAllTimers()

    const overlay = document.querySelector('#__sanityError')
    expect(overlay?.textContent).toContain('Uncaught error: Uncaught [object Object]')
    expect(overlay?.textContent).not.toContain('undefined')
    expect(overlay?.querySelector('pre')?.textContent).toBe('')
  })

  test('falls back to a generic message when a non-Error throw has no browser message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    globalThis.dispatchEvent(new ErrorEvent('error', {error: {}, message: ''}))
    vi.runAllTimers()

    const overlay = document.querySelector('#__sanityError')
    expect(overlay?.textContent).toContain('Uncaught error: Unknown error')
    expect(overlay?.textContent).not.toContain('undefined')
  })
})
