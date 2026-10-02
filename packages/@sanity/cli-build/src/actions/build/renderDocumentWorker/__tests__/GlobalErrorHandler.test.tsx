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
})
