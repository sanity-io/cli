import {type DOMWindow, JSDOM, VirtualConsole} from 'jsdom'
import {describe, expect, test} from 'vitest'

import {GlobalErrorHandler} from '../components/GlobalErrorHandler.js'

function getErrorHandlerScript(): string {
  const element = GlobalErrorHandler()
  const props = element.props as {dangerouslySetInnerHTML: {__html: string}}
  return props.dangerouslySetInnerHTML.__html
}

interface TestWindow {
  jsdomErrors: Error[]
  window: DOMWindow
}

function setupWindow(): TestWindow {
  // Keep the script's own `console.error` calls out of the test output, and collect any
  // exceptions jsdom reports from inside the script (e.g. thrown from a timer callback).
  const jsdomErrors: Error[] = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error) => {
    jsdomErrors.push(error)
  })

  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
    virtualConsole,
  })
  dom.window.eval(getErrorHandlerScript())

  return {jsdomErrors, window: dom.window}
}

async function waitForOverlay(window: DOMWindow): Promise<HTMLElement> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const overlay = window.document.querySelector<HTMLElement>('#__sanityError')
    if (overlay) return overlay
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Error overlay was not rendered')
}

describe('GlobalErrorHandler', () => {
  test('renders the message and stack of a regular Error', async () => {
    const {jsdomErrors, window} = setupWindow()
    const error = new window.Error('Something broke')

    window.dispatchEvent(
      new window.ErrorEvent('error', {
        colno: 7,
        error,
        filename: 'https://example.com/static/app.js',
        lineno: 42,
        message: 'Uncaught Error: Something broke',
      }),
    )

    const overlay = await waitForOverlay(window)
    expect(overlay.textContent).toContain('Uncaught error: Something broke')
    expect(overlay.textContent).toContain('https://example.com/static/app.js:42:7')
    expect(overlay.querySelector('pre')?.textContent).toContain('Error: Something broke')
    expect(jsdomErrors).toEqual([])
  })

  test('renders the browser message when the error object is null (cross-origin script error)', async () => {
    const {jsdomErrors, window} = setupWindow()

    // Browsers pass `error: null` (and a generic message) for errors thrown by cross-origin
    // scripts without CORS headers.
    window.dispatchEvent(
      new window.ErrorEvent('error', {
        colno: 0,
        error: null,
        filename: '',
        lineno: 0,
        message: 'Script error.',
      }),
    )

    const overlay = await waitForOverlay(window)
    expect(overlay.textContent).toContain('Uncaught error: Script error.')
    // The overlay must not crash on `error.message` and then render its own TypeError.
    expect(overlay.textContent).not.toMatch(/null is not an object|Cannot read propert/)
    expect(overlay.textContent).not.toContain('undefined')
    expect(jsdomErrors).toEqual([])
  })

  test('renders the browser message when window.onerror receives a null error', async () => {
    const {jsdomErrors, window} = setupWindow()

    // `window.onerror` receives the message as its first argument, not an ErrorEvent.
    window.onerror?.call(window, 'Script error.', '', 0, 0, null as unknown as Error)

    const overlay = await waitForOverlay(window)
    expect(overlay.textContent).toContain('Uncaught error: Script error.')
    expect(overlay.textContent).not.toMatch(/null is not an object|Cannot read propert/)
    expect(jsdomErrors).toEqual([])
  })

  test('falls back to a generic message when neither error nor message is available', async () => {
    const {jsdomErrors, window} = setupWindow()

    window.dispatchEvent(new window.ErrorEvent('error', {error: null, message: ''}))

    const overlay = await waitForOverlay(window)
    expect(overlay.textContent).toContain('Uncaught error: Unknown error')
    expect(jsdomErrors).toEqual([])
  })
})
